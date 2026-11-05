import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import path from "node:path";

/**
 * The two Prisma drivers must never drift.
 *
 * prisma/schema.postgres.prisma is a GENERATED mirror of the active
 * (SQLite) schema — only the provider line and the header comment differ.
 * It rotted once: a required `name` column survived there for releases,
 * and the first person who switched to Postgres could not register an
 * account at all (`Invalid prisma.user.create()` — no `name` field).
 * This test fails the build the moment the mirror goes stale; the fix is
 * always the same one command: `npm run db:mirror`.
 */

const root = path.resolve(__dirname, "../..");
const active = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
const mirror = readFileSync(path.join(root, "prisma", "schema.postgres.prisma"), "utf8");

/** drop comments and blank lines so headers and inline notes don't count */
function meaningful(src: string): string[] {
  return src
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trimEnd())
    .filter((l) => l.trim().length > 0);
}

/** model name → its field/attribute lines (comments stripped) */
function modelFields(src: string): Map<string, string[]> {
  const models = new Map<string, string[]>();
  let current: string | null = null;
  for (const raw of src.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    const head = /^model\s+(\w+)\s*\{/.exec(line);
    if (head) {
      current = head[1];
      models.set(current, []);
      continue;
    }
    if (!current) continue;
    if (line === "}") {
      current = null;
      continue;
    }
    if (line) models.get(current)!.push(line);
  }
  return models;
}

describe("prisma schema parity (sqlite active ↔ postgres mirror)", () => {
  it("mirrors the exact same models and fields", () => {
    expect(modelFields(mirror)).toEqual(modelFields(active));
  });

  it("differs from the active schema in exactly one line: the provider", () => {
    const a = meaningful(active);
    const b = meaningful(mirror);
    expect(a.length).toBe(b.length);
    const diffs: { line: number; a: string; b: string }[] = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) diffs.push({ line: i + 1, a: a[i], b: b[i] });
    }
    expect(diffs).toHaveLength(1);
    expect(diffs[0].a).toMatch(/provider\s*=\s*"sqlite"/);
    expect(diffs[0].b).toMatch(/provider\s*=\s*"postgresql"/);
  });

  it("declares the same binaryTargets so release bundles keep booting", () => {
    const targets = (src: string) => /binaryTargets\s*=\s*\[[^\]]*\]/.exec(src)?.[0];
    expect(targets(mirror)).toBe(targets(active));
  });
});
