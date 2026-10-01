import { expect, test, type Page } from "@playwright/test";

// The public site and account recovery, as a signed-out visitor sees them.

const PAGES: Array<{ path: string; heading: RegExp }> = [
  { path: "/security", heading: /Security at AutonomOS/ },
  { path: "/solutions", heading: /Agents for every team/ },
  { path: "/solutions/finance", heading: /Finance on autopilot/ },
  { path: "/solutions/people", heading: /People on autopilot/ },
  { path: "/docs", heading: /Getting started/ },
  { path: "/docs/autonomy-levels", heading: /Agent modes/ },
  { path: "/docs/running-agents", heading: /Running agents/ },
  { path: "/terms", heading: /Terms of service/ },
  { path: "/privacy", heading: /Privacy policy/ },
];

async function expectNoHorizontalOverflow(page: Page, path: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(scrollWidth, `${path} overflows horizontally`).toBeLessThanOrEqual(innerWidth);
}

test("signed-out visitors see the landing page at /", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Automate the recurring work");
  await expect(page.getByRole("link", { name: "Start free" }).first()).toHaveAttribute("href", "/signup");
  await expect(page.getByText("Example", { exact: true }).first()).toBeVisible();
});

test("public pages render", async ({ page }) => {
  for (const p of PAGES) {
    const res = await page.goto(p.path);
    expect(res?.status(), p.path).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
  }
  const robots = await page.request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Disallow: /api/");
  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("/security");
});

test("app routes still require sign-in", async ({ page }) => {
  await page.goto("/approvals");
  await expect(page).toHaveURL(/\/login\?next=%2Fapprovals/);
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
});

test("forgot password shows a neutral confirmation", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Work email").fill(`nobody-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account exists for that email, we sent a reset link.")).toBeVisible();
});

test("reset password without a recovery session says the link expired", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password");
});

test("public pages fit a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", ...PAGES.map((p) => p.path), "/login", "/signup", "/forgot-password"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalOverflow(page, path);
  }
});

test("addresses people type land on real pages", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page).toHaveURL(/\/#pricing$/);
  await page.goto("/blog");
  await expect(page).toHaveURL(/\/docs$/);
});

test("help is a permanent redirect to the docs, never a 404", async ({ page, request }) => {
  const res = await request.get("/help", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toMatch(/\/docs$/);
  const statuses: number[] = [];
  page.on("response", (r) => statuses.push(r.status()));
  await page.goto("/help");
  await expect(page).toHaveURL(/\/docs$/);
  expect(statuses).not.toContain(404);
});

test("a mistyped public address shows not found, not a sign-in form", async ({ page }) => {
  const res = await page.goto("/secruity");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "This page does not exist" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
});
