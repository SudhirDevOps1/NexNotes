'use strict';

/**
 * NexNotes desktop shell (Electron).
 *
 * The web app is a Next.js standalone server; this process keeps it alive and
 * shows it in a real desktop window — no console window, no browser tab.
 *
 * How it fits together:
 *   - the server bundle ships as an extraResource (resources/server), staged
 *     by scripts/stage-desktop.mjs from .next/standalone
 *   - the server runs as a child process: Electron's own binary doubles as
 *     Node via ELECTRON_RUN_AS_NODE=1, so no second runtime ships in the box
 *   - SQLite + auth secret live in the OS user-data dir
 *     (%APPDATA%\NexNotes on Windows, ~/.config/NexNotes on Linux) and
 *     survive both upgrades and uninstalls
 *   - first run seeds the schema-initialized template db from the bundle —
 *     prisma db push can't run here, the CLI alone would add ~50 MB
 *
 * A one-line handshake file (userData/server.json, { port, pid }) is written
 * once the server is healthy; CI smoke tests read it instead of guessing a
 * port, and it doubles as a debug aid.
 */

const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');

const SERVER_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'server')
  : process.env.NEXNOTES_SERVER_DIR ||
    path.join(__dirname, '..', '..', 'dist', 'server');

const APP_NAME = 'NexNotes';
const HEALTH_TIMEOUT_MS = 45_000;
const LOG_MAX_BYTES = 5 * 1024 * 1024;

// package.json's name is "nexnotes-desktop"; pin the user-facing name so the
// user-data dir is %APPDATA%\NexNotes on every platform, not the package name
app.setName(APP_NAME);
app.setPath('userData', path.join(app.getPath('appData'), APP_NAME));
app.setAppUserModelId('com.sudhirdevops.nexnotes');

let win = null;
let server = null;
let serverPort = 0;
let quitting = false;

const dbFile = () => path.join(app.getPath('userData'), 'nexnotes.db');
const logFile = () => path.join(app.getPath('userData'), 'logs', 'server.log');
const handshakeFile = () => path.join(app.getPath('userData'), 'server.json');

function rotateLog() {
  try {
    if (fs.statSync(logFile()).size > LOG_MAX_BYTES) fs.rmSync(logFile());
  } catch {
    /* first run — nothing to rotate */
  }
}

function authSecret() {
  const file = path.join(app.getPath('userData'), '.auth-secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* generate below */
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

/** First run: copy the schema-initialized template db into the data dir. */
function seedDatabase() {
  const target = dbFile();
  if (fs.existsSync(target)) return;
  const template = path.join(SERVER_DIR, 'db', 'nexnotes.db');
  if (!fs.existsSync(template)) {
    throw new Error(`template database missing in the app bundle (${template})`);
  }
  fs.copyFileSync(template, target);
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function probeHealth(port, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!server) throw new Error('the server process exited before becoming ready');
    if (await probeHealth(port, 1_500)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`the server did not become healthy within ${Math.round(timeoutMs / 1000)}s`);
}

function logTail(lines = 15) {
  try {
    return fs.readFileSync(logFile(), 'utf8').trimEnd().split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '(log file not written yet)';
  }
}

function bootFailure(message) {
  dialog.showErrorBox(
    `${APP_NAME} failed to start`,
    `${message}\n\n` +
      `Server log (last lines):\n${logTail()}\n\n` +
      `Full log: ${logFile()}`
  );
  app.quit();
}

async function startServer() {
  seedDatabase();
  serverPort = await pickFreePort();

  const dbUrl = 'file:' + dbFile().split(path.sep).join('/');
  // the log fd is inherited by the child process — keep it open for the
  // app's lifetime
  const logFd = fs.openSync(logFile(), 'a');

  server = spawn(process.execPath, [path.join(SERVER_DIR, 'server.js')], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(serverPort),
      HOSTNAME: '127.0.0.1',
      DATABASE_URL: dbUrl,
      AUTH_SECRET: authSecret(),
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
      CHECKPOINT_DISABLE: '1',
    },
    stdio: ['ignore', logFd, logFd],
  });

  server.on('exit', (code) => {
    server = null;
    if (!quitting && win && !win.isDestroyed()) {
      dialog.showErrorBox(
        APP_NAME,
        `The internal server stopped unexpectedly (exit code ${code ?? 'signal'}).\n\n` +
          `Last log lines:\n${logTail()}\n\nFull log: ${logFile()}`
      );
      app.quit();
    }
  });
}

function stopServer() {
  const proc = server;
  server = null;
  if (!proc) return;
  try {
    if (process.platform === 'win32') {
      // server.js has no grandchildren, but taskkill /T is cheap insurance
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  } catch {
    /* already gone */
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 620,
    show: false,
    backgroundColor: '#101014',
    title: APP_NAME,
    autoHideMenuBar: true,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  const baseUrl = `http://127.0.0.1:${serverPort}`;
  const isExternal = (url) => /^https?:$/i.test(new URL(url).protocol) && !url.startsWith(baseUrl);

  // links that want a new tab (docs, share previews, …) open in the user's
  // real browser; nothing may navigate the app window away from the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isExternal(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
  if (process.env.NEXNOTES_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.loadURL(baseUrl).catch((e) => bootFailure(`Could not load the app UI: ${e.message}`));
}

async function run() {
  try {
    fs.mkdirSync(path.join(app.getPath('userData'), 'logs'), { recursive: true });
    rotateLog();
    await startServer();
    await waitForServer(serverPort, HEALTH_TIMEOUT_MS);
    fs.writeFileSync(
      handshakeFile(),
      JSON.stringify(
        { port: serverPort, pid: server.pid, startedAt: new Date().toISOString() },
        null,
        2
      )
    );
    createWindow();
  } catch (e) {
    bootFailure(e.message);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(run);

  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', () => {
    quitting = true;
    try { fs.rmSync(handshakeFile(), { force: true }); } catch { /* best effort */ }
    stopServer();
  });
}
