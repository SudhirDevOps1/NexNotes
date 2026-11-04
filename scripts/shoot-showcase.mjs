#!/usr/bin/env node
/**
 * Re-shoots every README showcase screenshot against a locally running dev
 * server (:3000) on a freshly seeded demo account. Run:
 *   1. rm -f db/custom.db && bunx prisma db push   (fresh DB)
 *   2. bun run dev &
 *   3. node scripts/shoot-showcase.mjs
 *
 * Each shot is independent — a failure is logged and the run continues, so one
 * flaky dialog never blocks the whole set. Output: docs/screenshots/*.png
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "screenshots");
const BASE = "http://localhost:3000";

mkdirSync(OUT, { recursive: true });

const results = [];
const FILTER = process.env.FILTER || "";
async function shot(name, fn) {
  if (FILTER && !name.includes(FILTER)) return;
  const t0 = Date.now();
  try {
    await fn();
    results.push(`✓ ${name} (${Date.now() - t0}ms)`);
  } catch (err) {
    results.push(`✗ ${name}: ${String(err).split("\n")[0].slice(0, 160)}`);
    await page.screenshot({ path: join(OUT, `_debug-${name}.png`) }).catch(() => {});
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await ctx.newPage();

/** Open a note by its exact title text (clicks the title inside the row button). */
async function openNote(title) {
  await page.getByText(title, { exact: true }).first().click({ timeout: 10000 });
  await page.waitForTimeout(700);
}

/** Switch the editor to the rendered preview (markdown/KaTeX/wiki-links). */
async function previewMode() {
  const btn = page.getByLabel("Preview (Alt+E)");
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(1200); // let KaTeX/Prism finish hydrating
  }
}

async function openSettings() {
  await page.keyboard.press("Escape"); // dismiss any open dropdown menu first
  await page.waitForTimeout(300);
  await page.getByLabel("Settings").first().click();
  await page.waitForTimeout(900);
}

async function closeOverlays() {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await ensureDialogsClosed();
}

/** Escape any editor focus-trap/overlay and return to the Notes list. */
async function recover() {
  await closeOverlays();
  // exit batch-selection mode if it is still on (Escape does not exit it)
  const clear = page.getByText("Clear", { exact: true });
  if (await clear.isVisible().catch(() => false)) { await clear.click().catch(() => {}); await page.waitForTimeout(300); }
  const selectBtn = page.getByRole("button", { name: "Select", exact: true });
  if (await selectBtn.getAttribute("aria-pressed").catch(() => null) === "true") {
    await selectBtn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
  // clear any leftover search query
  const search = page.getByPlaceholder("Search notes…", { exact: true });
  if (await search.isVisible().catch(() => false)) {
    const val = await search.inputValue().catch(() => "");
    if (val) { await search.fill(""); await page.waitForTimeout(400); }
  }
  await page.getByText("Notes", { exact: true }).first().click();
  await page.waitForTimeout(600);
}

/** Close a Radix dialog even when focus lives elsewhere: click its overlay. */
async function ensureDialogsClosed() {
  for (let i = 0; i < 3; i++) {
    const dialog = page.locator("[role='dialog']:visible").first();
    if (!(await dialog.isVisible().catch(() => false))) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
    if (await dialog.isVisible().catch(() => false)) {
      // focus lives outside the dialog — Escape is ignored, click the X or overlay
      const close = dialog.locator("button[aria-label='Close'], button:has(svg.lucide-x)").first();
      if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
      else await page.mouse.click(20, 450); // overlay gutter (outside panels)
      await page.waitForTimeout(400);
    }
  }
}

await shot("login", async () => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("text=One-click demo login", { timeout: 20000 });
  if (!FILTER) await page.screenshot({ path: join(OUT, "login.png") });
});

await shot("demo-login", async () => {
  await page.getByText("One-click demo login").click();
  await page.waitForSelector("text=Welcome to NexNotes", { timeout: 30000 });
  await page.waitForTimeout(1500);
});

await shot("desktop-notes", async () => {
  await openNote("Welcome to NexNotes");
  await previewMode(); // rendered markdown — edit mode shows raw source
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, "desktop-notes.png") });
});

await shot("editor-math-wikilinks", async () => {
  await openNote("Feature tour — wiki, math & more");
  await previewMode(); // KaTeX + wiki links rendered, not $$ source
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, "editor-math-wikilinks.png") });
});

await shot("backlinks", async () => {
  await page.getByLabel("Backlinks — notes linking here").click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, "backlinks.png") });
  await closeOverlays();
});

await shot("history-dialog", async () => {
  await openNote("AI prompt library");
  await page.getByLabel("Note history (Ctrl+H)").click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(OUT, "history-dialog.png") });
  await closeOverlays();
});

await shot("code-highlighting", async () => {
  // the dedicated Prism demo note — its bash/ts fences light up with colour
  await openNote("Code demo — Prism highlighting ✨");
  await previewMode();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, "code-highlighting.png") });
});

await shot("spreadsheet", async () => {
  await openNote("Budget — monthly sheet");
  await page.waitForTimeout(1100);
  await page.screenshot({ path: join(OUT, "spreadsheet.png") });
});

await shot("authenticator", async () => {
  await openNote("2FA codes (demo)");
  await page.waitForTimeout(1100);
  await page.screenshot({ path: join(OUT, "authenticator.png") });
});

await shot("html-sandbox", async () => {
  await openNote("HTML demo — booking card");
  await page.waitForTimeout(1100);
  await page.screenshot({ path: join(OUT, "html-sandbox.png") });
});

await shot("richtext-wysiwyg", async () => {
  await page.getByLabel("Choose a note type").click();
  await page.waitForTimeout(400);
  await page.getByText("Rich text (WYSIWYG)").click();
  await page.waitForTimeout(1500);
  await page.keyboard.type("Product brief");
  await page.keyboard.press("Tab");
  await page.keyboard.type("A rich-text note — bold, lists, links and tables. Stored as plain markdown underneath.");
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, "richtext-wysiwyg.png") });
  await recover();
});

await shot("task-note", async () => {
  await openNote("Launch checklist");
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, "task-note.png") });
});

await shot("lock-dialog", async () => {
  // locked notes hide their real title until unlocked — the row reads "Locked note"
  await page.getByText("Locked note", { exact: false }).first().click({ timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(OUT, "lock-dialog.png") });
  await closeOverlays();
});

await shot("command-palette", async () => {
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(800);
  await page.keyboard.type("theme");
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, "command-palette.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
});

await shot("search", async () => {
  await recover(); // leave any open note/overlay behind — search needs a clean shell
  const search = page.getByPlaceholder("Search notes…", { exact: true });
  await search.click();
  await search.fill("math");
  await page.waitForTimeout(1100);
  if ((await search.inputValue()) !== "math") throw new Error("search text lost focus");
  await page.screenshot({ path: join(OUT, "search.png") });
  await recover();
});

await shot("batch-operations", async () => {
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.waitForTimeout(400);
  const rows = page.locator("button[aria-pressed]");
  await rows.nth(0).click();
  await rows.nth(1).click();
  await rows.nth(2).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, "batch-operations.png") });
  await recover();
});

await shot("smart-views", async () => {
  await page.getByLabel("New smart view").click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, "smart-views-batch.png") });
  await closeOverlays();
});

await shot("files-pane", async () => {
  await page.getByText("Files", { exact: true }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(OUT, "files-pane.png") });
  await page.getByText("Notes", { exact: true }).first().click();
  await page.waitForTimeout(400);
});

await shot("stats-dialog", async () => {
  await page.getByLabel("Statistics").first().click();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: join(OUT, "stats-dialog.png") });
  await closeOverlays();
});

await shot("settings-themes", async () => {
  await openSettings();
  await page.screenshot({ path: join(OUT, "settings-themes.png") });
  await closeOverlays();
});

await shot("templates", async () => {
  await recover();
  await openNote("Welcome to NexNotes");
  const menuBtn = page
    .locator("button:has(svg.lucide-more-horizontal), button:has(svg.lucide-ellipsis)")
    .last();
  await menuBtn.click();
  await page.waitForTimeout(500);
  await page.getByText("Insert template").click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, "templates.png") });
  await closeOverlays();
});

await shot("share-page", async () => {
  await recover();
  await openNote("Welcome to NexNotes");
  const menuBtn = page
    .locator("button:has(svg.lucide-more-horizontal), button:has(svg.lucide-ellipsis)")
    .last();
  await menuBtn.click();
  await page.waitForTimeout(500);
  await page.getByText("Share", { exact: true }).hover(); // Radix submenu opens on hover
  await page.waitForTimeout(700);
  // fresh note offers "Create public read-only link…", an already-shared note
  // offers "Copy public link" — both end with the URL in the clipboard
  const create = page.getByText("Create public read-only link…");
  const copy = page.getByText("Copy public link");
  if (await create.isVisible().catch(() => false)) await create.click();
  else await copy.click();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape"); // dismiss the success toast if it holds focus
  await page.waitForTimeout(400);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  if (!link.includes("/s/")) throw new Error(`no share link in clipboard: ${link.slice(0, 90)}`);
  await page.goto(link, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(OUT, "share-page.png") });
  await page.goBack();
  await page.waitForTimeout(900);
});

await shot("twofa-setup", async () => {
  await openSettings();
  await page.getByText("Security", { exact: true }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.getByPlaceholder("Confirm your account password").fill("NexNotes@2026");
  await page.getByRole("button", { name: "Set up 2FA" }).click();
  await page.waitForSelector("img[alt='2FA QR code']", { timeout: 12000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, "twofa-setup.png") });
  await closeOverlays();
});

await shot("api-tokens", async () => {
  await openSettings();
  await page.getByText("API access", { exact: false }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, "api-tokens.png") });
  await closeOverlays();
});

// mobile pass — separate context (own storage), same demo account
await shot("mobile-responsive", async () => {
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  });
  const mp = await mctx.newPage();
  await mp.goto(BASE, { waitUntil: "networkidle" });
  await mp.waitForSelector("text=One-click demo login", { timeout: 20000 });
  await mp.getByText("One-click demo login").click();
  await mp.waitForSelector("text=Welcome to NexNotes", { timeout: 30000 });
  await mp.waitForTimeout(1200);
  await mp.screenshot({ path: join(OUT, "mobile-responsive.png") });
  await mctx.close();
});

await ctx.close();
await browser.close().catch(() => {});
console.log(results.join("\n"));
