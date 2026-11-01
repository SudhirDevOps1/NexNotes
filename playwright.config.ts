import { defineConfig, devices } from "@playwright/test";

/**
 * E2E gate. In CI the workflow builds the standalone bundle first; the
 * webServer block boots it (and waits for /api/health) automatically.
 * Locally, reuse whatever is already listening so `bun run test:e2e`
 * stays fast during development.
 */
const PORT = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // one shared demo database — keep ordering deterministic
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun .next/standalone/server.js",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
