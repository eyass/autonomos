import { expect, test, type Page } from "@playwright/test";

// The PRD section 128 demo, end to end: create company → connect → discover → review →
// opportunity → agent → test run → activate → live ticket → approve → refund → dashboard.

async function approveAll(page: Page) {
  for (let i = 0; i < 5; i++) {
    await page.goto("/approvals");
    const card = page.getByTestId("approval-card").first();
    if (!(await card.isVisible().catch(() => false))) return i;
    await card.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByTestId("approval-card")).toHaveCount(0, { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
  }
  return 5;
}

test("demo loop", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  // Sign up
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Eve");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  // Create company
  await expect(page.getByRole("heading", { name: "Create your company" })).toBeVisible();
  await page.getByLabel("Company name").fill("E2E Marketplace");
  await page.getByLabel("Industry").selectOption("Marketplace");
  await page.getByRole("button", { name: "Create company" }).click();

  // About
  await page.getByLabel("What does your company do?").fill("We run an online marketplace for second-hand furniture.");
  await page.getByText("Customer Support", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Connect sandbox Zendesk and Stripe
  for (const key of ["zendesk", "stripe"]) {
    const card = page.getByTestId(`integration-${key}`);
    await card.getByRole("button", { name: "Connect" }).click();
    await card.getByRole("button", { name: "Use sandbox data" }).click();
    await expect(card.getByText(/Connected/)).toBeVisible();
  }
  await page.getByRole("button", { name: "Continue" }).click();

  // Guided discovery
  await expect(page).toHaveURL(/\/discover/);
  await page.getByRole("button", { name: "Start interview" }).click();
  await page.getByLabel("Your answer").fill("Answer tickets, approve refunds, and review flagged listings");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Refund request handling")).toBeVisible();
  await page.getByRole("button", { name: /Save \d+ to inventory/ }).click();

  // Review the refund process and generate an opportunity
  await expect(page).toHaveURL(/\/processes/);
  await page.getByRole("link", { name: "Refund request handling" }).click();
  await expect(page).toHaveURL(/\/processes\/[0-9a-f-]+/);
  const processUrl = page.url();
  await page.getByRole("button", { name: "Approve process" }).click();
  await page.getByRole("button", { name: "Create automation opportunity" }).click();
  await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]+/);
  await expect(page.getByText("Proposed", { exact: true })).toBeVisible();
  const opportunityUrl = page.url();

  // Create the agent through the wizard
  await page.getByRole("link", { name: "Create agent" }).click();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create agent" }).click();
  await expect(page).toHaveURL(/\/agents\/[0-9a-f-]+/);
  const agentUrl = page.url().split("?")[0]!;

  // Test run: simulated, lists the approvals production would need
  await page.getByRole("button", { name: "Run test" }).click();
  await expect(page).toHaveURL(/\/activity\/[0-9a-f-]+/);
  await expect(page.getByText("Test finished")).toBeVisible();
  await expect(page.getByText("Approvals needed in production")).toBeVisible();

  // Activate and send a live sandbox ticket
  await page.goto(agentUrl);
  await page.getByRole("button", { name: "Activate agent" }).click();
  await expect(page.getByRole("button", { name: "Send ticket" })).toBeVisible();
  await page.getByRole("button", { name: "Send ticket" }).click();
  await expect(page).toHaveURL(/\/activity\/[0-9a-f-]+/);
  const runUrl = page.url();
  await expect(page.getByText(/Waiting for approval/)).toBeVisible();

  // Approve: refund, reply and ticket update each stop at L3
  const approved = await approveAll(page);
  expect(approved).toBeGreaterThanOrEqual(1);
  await page.goto(runUrl);
  await expect(page.getByText("Done")).toBeVisible();
  await expect(page.getByText("Create refunds").first()).toBeVisible();

  // Dashboard reflects the live agent and time saved
  await page.goto("/");
  await expect(page.getByTestId("autonomy-score")).not.toHaveText("0%");
  await expect(page.getByText("Active agents").locator("..")).toContainText("1");

  // Emergency stop is reachable and reversible
  await page.goto("/settings");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Pause all agents" }).click();
  await expect(page.getByText(/All agents are paused/)).toBeVisible();
  await page.getByRole("button", { name: "Resume all agents" }).click();
  await expect(page.getByRole("button", { name: "Pause all agents" })).toBeVisible();

  // Phone layout: every page fits the screen width and the menu reaches every section
  await page.setViewportSize({ width: 390, height: 844 });
  const pages = ["/", "/approvals", "/approvals?view=resolved", "/processes", processUrl, "/opportunities", opportunityUrl, "/agents", agentUrl, "/activity", runUrl, "/discover", "/integrations", "/settings"];
  for (const url of pages) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${url} is wider than the screen`).toBeLessThanOrEqual(0);
    if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/${url.replace(/^https?:\/\/[^/]+/, "").replace(/[^a-z0-9]+/gi, "_") || "_"}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Agents" }).click();
  await expect(page).toHaveURL(/\/agents$/);
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
});
