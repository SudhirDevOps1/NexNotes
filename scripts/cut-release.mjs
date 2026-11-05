#!/usr/bin/env node
/**
 * cut-release.mjs — the release train's version cutter.
 *
 * Replaces the release-please PR loop with a direct main-branch release:
 * the GitHub App/GITHUB_TOKEN used to need the "Actions can create and
 * approve pull requests" repository setting to open the release PR; when
 * that toggle is off (GitHub's default for new repos) every push to main
 * went red with "not permitted to create or approve pull requests".
 * Cutting the release straight on main needs only `contents: write`, which
 * the workflow already grants — no settings, no extra secret.
 *
 * What it does (idempotent, safe to re-run):
 *   1. reads the current version from package.json (the single source of
 *      truth — src/lib/version.ts serves it from the health endpoint)
 *   2. lists Conventional Commits since the matching v<version> tag
 *   3. bumps per pre-major SemVer: fix/perf/revert/security → patch,
 *      feat → minor, BREAKING CHANGE → patch (bump-minor-pre-major +
 *      bump-patch-for-minor-pre-major, same numbers release-please produced)
 *   4. prepends the section to CHANGELOG.md in the exact house style
 *      (visible sections only — docs/ci/chore are omitted, matching the
 *      hidden sections of the old release-please config)
 *   5. bumps package.json AND desktop/package.json (the desktop manifest
 *      used to drift — it stayed on 0.0.1 while the app was on 0.0.4)
 *   6. commits "chore(main): release nexnotes x.y.z" as github-actions[bot],
 *      tags v<x.y.z> (annotated), pushes main + tag, creates the GitHub
 *      Release with the generated section as body
 *   7. no release-worthy commits, or HEAD already released → exits 0 with
 *      releases_created=false so the workflow stays green
 *
 * Dry-run: `node scripts/cut-release.mjs --dry-run` prints the plan and
 * touches nothing.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DRY = process.argv.includes("--dry-run");
const REPO_URL = "https://github.com/SudhirDevOps1/NexNotes";

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts }).trim();
}

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

/* ---------- gather state ---------- */

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const baseVersion = pkg.version;
const baseTag = `v${baseVersion}`;

const tagExists = (() => {
  try {
    git(["rev-parse", "-q", "--verify", `refs/tags/${baseTag}`]);
    return true;
  } catch {
    return false;
  }
})();

const headSubject = git(["log", "-1", "--format=%s"]);
const headSha = git(["rev-parse", "HEAD"]);

// right after a release commit (e.g. a manual workflow_dispatch) there is
// nothing to do — the tag already points at HEAD
if (tagExists && git(["rev-parse", `${baseTag}^{commit}`]) === headSha) {
  console.log(`HEAD is already released as ${baseTag} — nothing to do`);
  emit(false, "", "");
  process.exit(0);
}

/* ---------- collect + classify commits since the last tag ---------- */

const RANGE = tagExists ? `${baseTag}..HEAD` : "HEAD";
const raw = git(["log", RANGE, "--format=%H%x01%B%x02"]);

const SECTIONS = [
  { type: "feat", title: "Features" },
  { type: "fix", title: "Bug Fixes" },
  { type: "security", title: "Security" },
  { type: "perf", title: "Performance" },
  { type: "revert", title: "Reverts" },
];
const HIDDEN = new Set(["docs", "refactor", "test", "build", "ci", "chore"]);
const RELEASE_COMMIT_RE = /^chore\(main\): release nexnotes /;

const bullets = new Map(SECTIONS.map((s) => [s.title, []]));
let breaking = false;
let noteworthy = false;

for (const rec of raw.split("\x02")) {
  const record = rec.trim();
  if (!record) continue;
  const [sha, body] = record.split("\x01");
  const lines = body.trim().split("\n");
  const subject = (lines[0] || "").trim();
  if (!subject || RELEASE_COMMIT_RE.test(subject)) continue;

  const m = subject.match(/^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/);
  if (!m) continue; // not Conventional — ignore, like release-please does
  const [, type, scope, bang, desc] = m;
  const isBreaking = bang === "!" || /^BREAKING CHANGE:/m.test(body);
  if (isBreaking) breaking = true;

  const section = SECTIONS.find((s) => s.type === type);
  if (section) {
    noteworthy = true;
    const text = desc.replace(/\.$/, "");
    const short = sha.slice(0, 7);
    const scopePart = scope ? `**${scope}:** ` : "";
    bullets
      .get(section.title)
      .push(`* ${scopePart}${text} ([${short}](${REPO_URL}/commit/${sha}))`);
  } else if (HIDDEN.has(type)) {
    // hidden section — omitted from the notes, never triggers a release
  } else {
    continue; // unknown prefix — ignore
  }
}

if (!noteworthy) {
  console.log(
    `no feat/fix/perf/security/revert commits since ${tagExists ? baseTag : "the beginning"} — nothing to release`
  );
  emit(false, "", "");
  process.exit(0);
}

/* ---------- semver bump (pre-major rules) ---------- */

const [maj, min, pat] = baseVersion.split(".").map(Number);
let next;
if (breaking) next = `${maj}.${min}.${pat + 1}`; // bump-patch-for-minor-pre-major
else if (bullets.get("Features").length) next = `${maj}.${min + 1}.0`; // bump-minor-pre-major
else next = `${maj}.${min}.${pat + 1}`;
const tag = `v${next}`;
const today = new Date().toISOString().slice(0, 10);

/* ---------- changelog section (house style) ---------- */

let section = `## [${next}](${REPO_URL}/compare/${baseTag}...${tag}) (${today})\n\n\n`;
for (const { title } of SECTIONS) {
  const items = bullets.get(title);
  if (!items.length) continue;
  section += `### ${title}\n\n${items.join("\n")}\n\n`;
}
section = section.replace(/\n+$/, "\n");

const changelog = readFileSync("CHANGELOG.md", "utf8");
const firstSection = changelog.search(/^## \[/m);
if (firstSection === -1) fail("CHANGELOG.md has no '## [' section to prepend before");
const updated = changelog.slice(0, firstSection) + section + "\n" + changelog.slice(firstSection);

/* ---------- plan ---------- */

console.log(`releasing ${baseVersion} -> ${next} (${tag})`);
for (const { title } of SECTIONS) {
  for (const item of bullets.get(title)) console.log("  " + item);
}
if (DRY) {
  console.log("dry-run — no files touched, no commits made");
  process.exit(0);
}

/* ---------- write, commit, tag, push, release ---------- */

writeFileSync("CHANGELOG.md", updated);
for (const manifest of ["package.json", "desktop/package.json"]) {
  const raw = readFileSync(manifest, "utf8");
  const parsed = JSON.parse(raw);
  parsed.version = next;
  // keep the original file's tail formatting (newline or not)
  const tail = raw.endsWith("\n") ? "\n" : "";
  writeFileSync(manifest, JSON.stringify(parsed, null, 2) + tail);
}

git(["config", "user.name", "github-actions[bot]"]);
git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
git(["add", "CHANGELOG.md", "package.json", "desktop/package.json"]);
git(["commit", "-m", `chore(main): release nexnotes ${next}`]);
git(["tag", "-a", tag, "-m", `chore(main): release nexnotes ${next}`]);
git(["push", "origin", "HEAD:main"]);
git(["push", "origin", tag]);

// GitHub Release body for the publish job / direct creation
const notesDir = mkdtempSync(join(tmpdir(), "nx-release-"));
const notesPath = join(notesDir, "notes.md");
writeFileSync(notesPath, section.trimEnd() + "\n");

emit(true, tag, notesPath);

/* ---------- outputs for the workflow ---------- */

function emit(released, tag, notesPath) {
  const out = process.env.GITHUB_OUTPUT;
  const lines = [
    `releases_created=${released}`,
    `tag_name=${tag}`,
    `notes_file=${notesPath}`,
  ];
  console.log(`outputs: ${lines.join(" | ")}`);
  if (out) appendFileSync(out, lines.join("\n") + "\n");
}
