#!/usr/bin/env node
/**
 * Stages the Next.js standalone server for the Electron desktop shell.
 *
 *   build/desktop-payload/server/   — copied from .next/standalone
 *                                     (build step must already have put
 *                                     .next/static + public inside it)
 *   build/desktop-payload/server/db/nexnotes.db — schema-initialized template db
 *
 * The desktop app copies the template into the OS user-data dir on first
 * launch (desktop/src/main.js → seedDatabase) and never touches the copy
 * again — upgrades and uninstalls keep user data. Shipping the prisma CLI
 * just to re-run db push on the client was measured at +48 MB compressed
 * for a one-time job a 2 MB template does for free.
 *
 * --os linux|win   drops the other platform's prisma query engine from the
 *                  staged bundle — each installer only carries its own
 *                  engine (~18 MB of dead weight otherwise)
 *
 * Also syncs desktop/package.json's version with the root package.json, so
 * artifact names can never drift from the release tag.
 *
 * Usage: node scripts/stage-desktop.mjs [--standalone .next/standalone]
 *                                       [--out build/desktop-payload/server]
 *                                       [--os linux|win]
 */
import { readFile, mkdir, rm, cp, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  return {
    standalone: path.resolve(get("--standalone", path.join(ROOT, ".next/standalone"))),
    // NOTE — two things about this path. First, the extra "desktop-payload"
    // level is load-bearing: electron-builder unconditionally ignores a
    // ROOT-level node_modules dir in extraResources (app-builder-lib
    // out/util/filter.js), so the bundle must be nested one level down for
    // node_modules to reach the installers. Second, it stages under build/
    // on purpose, NOT dist/ — dist/ is what the release job uploads as
    // artifacts, and the first v2.2.0 tag build shipped the whole staged
    // server (~1300 files) to the publish step that way.
    out: path.resolve(get("--out", path.join(ROOT, "build/desktop-payload/server"))),
    os: get("--os", process.platform === "win32" ? "win" : "linux"),
  };
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (exit ${r.status})`);
}

async function dirSize(dir) {
  const { stat } = await import("node:fs/promises");
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const dirPath = stack.pop();
    for (const entry of await readdir(dirPath, { withFileTypes: true })) {
      const p = path.join(dirPath, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else total += (await stat(p)).size;
    }
  }
  return total;
}

async function main() {
  const { standalone, out, os } = parseArgs();
  if (os !== "linux" && os !== "win") throw new Error(`--os must be linux or win, got "${os}"`);
  if (!existsSync(path.join(standalone, "server.js"))) {
    throw new Error(`no server.js in ${standalone} — run "next build" first`);
  }

  // keep desktop/package.json's version glued to the root one
  const { version } = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const desktopPkgPath = path.join(ROOT, "desktop", "package.json");
  const desktopPkg = JSON.parse(await readFile(desktopPkgPath, "utf8"));
  if (desktopPkg.version !== version) {
    desktopPkg.version = version;
    await writeFile(desktopPkgPath, JSON.stringify(desktopPkg, null, 2) + "\n");
    console.log(`desktop/package.json version → ${version}`);
  }

  // schema-initialized SQLite template — prisma generate does NOT create
  // tables, and a fresh install has no db to boot against
  const templateDb = path.join(out, ".template.db");
  await rm(out, { recursive: true, force: true });
  await mkdir(path.dirname(templateDb), { recursive: true });
  run("bunx", ["prisma", "db", "push", "--skip-generate"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: `file:${templateDb.split(path.sep).join("/")}` },
  });
  if (!existsSync(templateDb)) {
    throw new Error("prisma db push did not produce the template database");
  }

  console.log(`staging server bundle → ${out}`);
  await cp(path.join(standalone, "."), out, { recursive: true, dereference: true });

  // each installer carries only its own query engine
  const clientDir = path.join(out, "node_modules", ".prisma", "client");
  if (existsSync(clientDir)) {
    const drop = os === "linux" ? /query_engine-windows\.dll\.node$/ : /libquery_engine-.*\.so\.node$/;
    let freed = 0;
    for (const f of await readdir(clientDir)) {
      if (drop.test(f)) {
        const { statSync, unlinkSync } = await import("node:fs");
        freed += statSync(path.join(clientDir, f)).size;
        unlinkSync(path.join(clientDir, f));
      }
    }
    if (freed > 0) console.log(`pruned foreign query engine (${(freed / 1048576).toFixed(1)} MB)`);
  }

  await mkdir(path.join(out, "db"), { recursive: true });
  await cp(templateDb, path.join(out, "db", "nexnotes.db"));
  await rm(templateDb, { force: true });

  const bytes = await dirSize(out);
  console.log(`staged ${path.relative(ROOT, out)} (${os}): ${(bytes / 1048576).toFixed(1)} MB unpacked`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
