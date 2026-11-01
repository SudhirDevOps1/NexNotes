import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit test setup. `tests/unit/*` runs in plain node — no DOM needed, the
 * covered libs (totp, crypto, templates, sn-import) are all isomorphic.
 * Coverage focuses on src/lib, the part that carries the crypto logic.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/lib/**"],
      exclude: ["src/lib/db.ts", "src/lib/store.ts"], // require DB/browser runtime
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
