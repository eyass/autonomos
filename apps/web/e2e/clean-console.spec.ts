import { expect, test, type Page } from "@playwright/test";

// A production build, walked like a person would: every main page, on a desktop and a phone
// screen, and the Discover tabs switched back and forth. Any uncaught error or React error
// (hydration mismatch #418, "x is not a function") fails the test.
async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Cleo");
  await page.getByLabel("Last name").fill("Console");
  await page.getByLabel("Work email").fill(`e2e-console-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Company website").fill("http://127.0.0.1:3999/site");
  await page.getByRole("button", { name: "Read my website" }).click();
  await expect(page.getByLabel("Company name")).toHaveValue("Acme Furniture");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Work" })).toBeVisible();
}

const PAGES = ["/", "/processes", "/opportunities", "/agents", "/approvals", "/activity", "/integrations", "/settings", "/workspaces", "/discover?tab=interview", "/discover?tab=document"];

test("no page or React errors across the app, on desktop and phone", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // Network failures are reported by the responses themselves; this looks for code errors.
    if (/Failed to load resource/.test(text)) return;
    errors.push(`console: ${text}`);
  });
  await signUp(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Explore a sample workspace" }).click();
  await expect(page.getByText(/Sample workspace\. The company/)).toBeVisible({ timeout: 90_000 });

  for (const size of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      // Nothing wider than the screen.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${size.width}px scrolls sideways`).toBeLessThanOrEqual(1);
    }
    // Discover: switch tabs in the browser, including while an interview answer is worked on.
    await page.goto("/discover?tab=interview");
    await page.getByRole("button", { name: "Start interview" }).click();
    await page.getByLabel("Your answer").fill("We answer tickets and approve refunds.");
    await page.getByRole("button", { name: "Send" }).click();
    for (const tab of ["Document", "From your systems", "Interview", "Document", "Interview"]) await page.getByRole("tab", { name: tab }).click();
    await page.getByRole("button", { name: "Restart" }).click();
  }
  expect(errors).toEqual([]);
});
