import { expect, test } from "@playwright/test";

/**
 * Small, stable end-to-end gate: the page boots, accounts work, and the
 * workspace is reachable after login. Deliberately UI-light so it stays
 * green on CI — deeper interaction coverage lives in unit tests + manual QA.
 */

test.describe("NexNotes smoke journey", () => {
  test("login screen renders with the demo entry point", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "NexNotes" })).toBeVisible();
    await expect(page.getByText("Local-first · End-to-end encrypted")).toBeVisible();
    await expect(page.getByRole("button", { name: "One-click demo login" })).toBeVisible();
  });

  test("demo login opens the workspace", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "One-click demo login" }).click();
    // app-shell replaces the auth screen once the session is up
    await expect(page.getByRole("button", { name: "New note" }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Folders", { exact: true })).toBeVisible();
    await expect(page.getByText("Tags", { exact: true })).toBeVisible();
  });

  test("health + register API respond correctly", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
    expect((await health.json()).ok).toBe(true);

    const email = `pw-${Date.now()}-${Math.floor(Math.random() * 1e6)}@nexnotes.test`;
    const register = await request.post("/api/auth/register", {
      data: { email, password: "PwTest@123" },
    });
    expect(register.ok()).toBeTruthy();
    expect((await register.json()).user.email).toBe(email);
  });

  test("fresh boot self-heals the database — no manual db push", async ({ request }) => {
    // This suite boots the standalone server against a NEVER-PUSHED database
    // (the workflow creates no tables). The server must create its own schema:
    // health reports the probe as ready, and auth endpoints answer normally
    // instead of the old "schema is out of date — run npx prisma db push".
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
    expect((await health.json()).dbReady).toBe(true);

    const me = await request.get("/api/auth/me");
    expect(me.status()).toBe(401);
    expect((await me.json()).user).toBeNull();
  });
});
