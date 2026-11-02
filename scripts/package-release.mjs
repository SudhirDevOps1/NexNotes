#!/usr/bin/env node
/**
 * Packages the production standalone build into shippable, versioned artifacts:
 *
 *   nexnotes-v<version>-linux-x64.tar.gz       portable server (run.sh launcher)
 *   nexnotes-v<version>-windows-x64.zip        portable server (run.cmd launcher)
 *
 * Checksums are NOT written here — the publish job covers every asset
 * (server packages + Electron installers) in one SHA256SUMS file.
 *
 * Two things make the packages boot on a truly fresh machine:
 *   1. `prisma db push` ships a schema-initialized db/nexnotes.db — generate
 *      alone does NOT create tables (this exact trap burned the CI runners).
 *   2. pass --node-win <node.exe> to embed the Windows Node runtime so the
 *      zip / installer run without a system-wide Node install.
 *
 * The version always comes from package.json — release-please bumps it, so
 * artifact names can never drift from the tagged release.
 *
 * Usage: node scripts/package-release.mjs --standalone .next/standalone --out dist [--node-win path\to\node.exe]
 */
import { readFile, mkdir, rm, cp, writeFile, chmod, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const nodeWin = get("--node-win");
  return {
    standalone: path.resolve(get("--standalone") ?? path.join(ROOT, ".next/standalone")),
    out: path.resolve(get("--out") ?? path.join(ROOT, "dist")),
    nodeWin: nodeWin ? path.resolve(nodeWin) : undefined,
  };
}

function run(cmd, opts) {
  const r = spawnSync(cmd, opts.args ?? [], { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${opts.args?.join(" ") ?? ""} failed (exit ${r.status})`);
}

const RUN_SH = `#!/usr/bin/env bash
# NexNotes portable server (Linux/macOS) — needs Node.js 20+ (https://nodejs.org)
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install it from https://nodejs.org"; exit 1
fi
mkdir -p db
if [ -z "\${DATABASE_URL:-}" ]; then export DATABASE_URL="file:\$(pwd)/db/nexnotes.db"; fi
if [ -z "\${AUTH_SECRET:-}" ]; then
  if [ -f .auth-secret ]; then export AUTH_SECRET="\$(cat .auth-secret)"
  else
    umask 077
    openssl rand -hex 32 > .auth-secret 2>/dev/null || head -c 32 /dev/urandom | sha256sum | cut -d' ' -f1 > .auth-secret
    export AUTH_SECRET="\$(cat .auth-secret)"
  fi
fi
PORT="\${PORT:-3000}"
echo "NexNotes running on http://localhost:\$PORT — Ctrl+C to stop"
exec node server.js
`;

const RUN_CMD = String.raw`@echo off
rem NexNotes portable server (Windows) — Node 20+ required unless bin\node.exe is bundled
cd /d "%~dp0"
set "NODE_EXE=node"
if exist "%~dp0bin\node.exe" (set "NODE_EXE=%~dp0bin\node.exe") else (
  where node >nul 2>nul || (echo Node.js 20+ is required. Download it from https://nodejs.org & pause & exit /b 1)
)
if not exist db mkdir db
rem forward slashes — prisma's sqlite URL parser is happiest with them
if not defined DATABASE_URL set "DATABASE_URL=file:%cd:\=/%/db/nexnotes.db"
if not defined AUTH_SECRET (
  if exist .auth-secret (
    set /p AUTH_SECRET=<.auth-secret
  ) else (
    for /f %%i in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')"') do (
      set AUTH_SECRET=%%i
      >.auth-secret echo %%i
    )
  )
)
echo NexNotes running on http://localhost:3000 - Ctrl+C to stop
if not defined NEXNOTES_NO_BROWSER start "" http://localhost:3000
"%NODE_EXE%" server.js
`;

const INSTALL_TXT = (version) => `NexNotes v${version} — portable server
=====================================

Quick start (Node.js 20+ required on Linux/macOS; Windows ships a bundled node.exe):

  Linux / macOS : ./run.sh
  Windows       : double-click run.cmd

The server listens on http://localhost:3000 by default.
Change the port with the PORT environment variable.

Data lives in ./db/nexnotes.db (SQLite, schema pre-initialized).
Set DATABASE_URL to a Neon Postgres connection string to switch drivers.

Environment variables:
  PORT           listen port (default 3000)
  DATABASE_URL   sqlite file: URL or postgres:// URL
  AUTH_SECRET    session signing secret (auto-generated to .auth-secret if unset)

Source & docs: https://github.com/SudhirDevOps1/NexNotes
License: AGPL-3.0
`;

async function main() {
  const { standalone, out, nodeWin } = parseArgs();
  const { version } = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const v = `v${version}`;

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  // Build a schema-initialized SQLite template so first boot works with zero
  // setup — prisma generate does NOT create tables, and a fresh machine has
  // no way to run db push by itself.
  const templateDb = path.join(out, ".schema-template.db");
  await rm(templateDb, { force: true });
  run("bunx", {
    args: ["prisma", "db", "push", "--skip-generate"],
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: `file:${templateDb}` },
  });
  if (!(await readdir(path.dirname(templateDb))).includes(path.basename(templateDb))) {
    throw new Error("prisma db push did not produce the template database");
  }

  const staging = path.join(out, `nexnotes-${v}`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await cp(path.join(standalone, "."), staging, { recursive: true });

  await mkdir(path.join(staging, "db"), { recursive: true });
  await cp(templateDb, path.join(staging, "db", "nexnotes.db"));
  await rm(templateDb, { force: true });

  if (nodeWin) {
    await mkdir(path.join(staging, "bin"), { recursive: true });
    await cp(nodeWin, path.join(staging, "bin", "node.exe"));
  }

  await writeFile(path.join(staging, "run.sh"), RUN_SH);
  await chmod(path.join(staging, "run.sh"), 0o755);
  // cmd.exe demands CRLF — with LF endings it executes random fragments of
  // lines ('NexNotes' is not recognized / '/d' is not recognized ...) and the
  // server never starts. Learned the hard way on the tag build runner.
  const toCmd = (s) => s.replace(/\n/g, "\r\n");
  await writeFile(path.join(staging, "run.cmd"), toCmd(RUN_CMD));
  // identical copy under the brand name — the Start-Menu shortcut and the
  // installer smoke test point here (run.cmd stays for the portable zip users)
  await writeFile(path.join(staging, "nexnotes.cmd"), toCmd(RUN_CMD));
  await writeFile(path.join(staging, "INSTALL.txt"), INSTALL_TXT(version));

  process.chdir(out);

  // tar preserves the +x bit; zip is for Windows where it is irrelevant.
  run("tar", { args: ["-czf", `nexnotes-${v}-linux-x64.tar.gz`, `nexnotes-${v}`] });
  run("zip", { args: ["-qr", `nexnotes-${v}-windows-x64.zip`, `nexnotes-${v}`] });

  await rm(staging, { recursive: true, force: true });

  console.log("packaged:", (await readdir(out)).filter((f) => f.startsWith("nexnotes-")).join(", "), nodeWin ? "(windows node bundled)" : "");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
