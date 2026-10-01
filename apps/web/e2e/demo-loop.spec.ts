import { expect, test, type Page } from "@playwright/test";

// The PRD section 128 demo, end to end: create company → connect → discover → review →
// opportunity → agent → test run → activate → live ticket → approve → refund → dashboard.

async function approveAll(page: Page) {
  for (let i = 0; i < 5; i++) {
    await page.goto("/approvals");
    const card = page.getByTestId("approval-card").first();
    if (!(await card.isVisible().catch(() => false))) return i;
    await card.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByTestId("approval-card"))
      .toHaveCount(0, { timeout: 5_000 })
      .catch(() => undefined);
    await page.waitForTimeout(1500);
  }
  return 5;
}

// Full-page screenshots for visual review, only when E2E_SCREENSHOTS is set.
async function shot(page: Page, name: string) {
  if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/${name}.png`, fullPage: true });
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

  // Your company: AutonomOS reads the website and fills everything in
  await expect(page.getByRole("heading", { name: "Your company" })).toBeVisible();
  await page.getByLabel("Company website").fill("http://127.0.0.1:3999/site");
  // Reading runs on the server: reloading as soon as it starts neither stops it nor loses the result.
  await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/jobs") && r.status() === 200), page.getByRole("button", { name: "Read my website" }).click()]);
  await page.reload();
  await expect(page.getByLabel("Company name")).toHaveValue("Acme Furniture");
  await expect(page.getByLabel("Industry")).toHaveValue("Marketplaces");
  await expect(page.getByLabel("Number of employees")).toHaveValue("20–49");
  await expect(page.getByLabel("Country")).toHaveValue("Netherlands");
  await expect(page.getByLabel("What does your company do?")).toHaveValue(/marketplace/i);
  await expect(page.getByRole("checkbox", { name: "Customer Support" })).toBeChecked();
  await shot(page, "onboarding-company");
  await page.getByRole("button", { name: "Create company" }).click();

  // Connect: the tools found on the website come first
  await expect(page.getByText("Found on your website")).toBeVisible();
  for (const key of ["zendesk", "stripe"]) {
    const card = page.getByTestId(`integration-${key}`);
    await expect(card.getByText("Detected")).toBeVisible();
    await card.getByRole("button", { name: "Connect" }).click();
    await card.getByRole("button", { name: "Use sandbox data" }).click();
    await expect(card.getByText(/Connected/)).toBeVisible();
  }
  await shot(page, "onboarding-connect");
  // People can go back to the company info and return without losing connections
  await page.getByRole("link", { name: "Back to company info" }).click();
  await expect(page).toHaveURL(/\/onboarding\/about$/);
  await expect(page.getByRole("heading", { name: /Tell us about Acme Furniture/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding\/connect$/);
  await expect(page.getByTestId("integration-zendesk").getByText(/Connected/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // The first inventory is drafted without an interview, on a page that shows each step
  await expect(page).toHaveURL(/\/onboarding\/mapping$/);
  const steps = page.getByTestId("mapping-steps");
  await expect(steps.getByText("Reading your website")).toBeVisible();
  await expect(steps.getByText("Reading Zendesk")).toBeVisible();
  await expect(steps.getByText("Drafting your processes")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your first process inventory is ready" })).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/processes\?status=draft&drafted=\d+/);
  await expect(page.getByText(/AutonomOS drafted \d+ process/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Refund request handling" })).toBeVisible();
  await shot(page, "drafted-processes");

  // The guided interview still works, with one-tap suggested answers; duplicates are not added
  await page.goto("/discover?tab=interview");
  await page.getByRole("button", { name: "Start interview" }).click();
  await page.getByRole("button", { name: /Answer tickets, approve refunds/ }).click();
  await expect(page.getByLabel("Your answer")).toHaveValue(/Answer tickets, approve refunds/);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.getByRole("button", { name: "Send" }).click();
  // The answer is worked on by the server: switching tabs meanwhile neither breaks the page
  // nor loses the answer, and a reload picks the interview back up.
  await page.getByRole("tab", { name: "Document" }).click();
  await expect(page).toHaveURL(/tab=document/);
  await expect(page.getByText("Import a document")).toBeVisible();
  await page.getByRole("tab", { name: "Interview" }).click();
  await expect(page.getByText("Refund request handling")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Refund request handling")).toBeVisible();
  expect(pageErrors).toEqual([]);
  await shot(page, "interview");
  await page.getByRole("button", { name: /Save \d+ to inventory/ }).click();
  await expect(page).toHaveURL(/\/processes/);

  // Discovery reads the connected systems on its own and proposes processes with evidence
  await page.goto("/discover");
  // Discovery runs on the server: reloading while it reads does not stop it.
  await expect(page.getByText("Reading your connected systems")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("list", { name: "Systems read" }).getByText(/Read \d+ tickets/)).toBeVisible({ timeout: 60_000 });
  // Proposals come one at a time: add, reject (never suggested again) or decide later
  const review = page.getByTestId("proposal-review");
  await expect(review.getByText("Is this work you do?")).toBeVisible({ timeout: 60_000 });
  const current = review.getByTestId("proposal").getByRole("heading");
  // Analyst proposals built on what is connected come with the ones seen in the data.
  await expect(review.getByText(/of \d+/)).toBeVisible();
  for (let i = 0; i < 20 && (await current.textContent()) !== "Customer invoice requests"; i++) {
    const before = await current.textContent();
    await page.keyboard.press("ArrowDown");
    await expect(current).not.toHaveText(before!);
  }
  await expect(current).toHaveText("Customer invoice requests");
  await expect(review.getByText(/Zendesk:/)).toBeVisible();
  // Every suggestion says why it is worth it; low-value ones are left out (and counted).
  await expect(review.getByTestId("proposal-value")).toContainText(/money, customers or growth|take over about/);
  await shot(page, "system-discovery");
  await review.getByRole("button", { name: "Approve Customer invoice requests" }).click();
  await expect(current).not.toHaveText("Customer invoice requests");
  const rejectedTitle = (await current.textContent())!;
  await review.getByRole("button", { name: `Reject ${rejectedTitle}` }).click();
  await expect(current).not.toHaveText(rejectedTitle);
  await review.getByRole("button", { name: "Undo reject" }).click();
  await expect(current).toHaveText(rejectedTitle);
  await page.keyboard.press("ArrowLeft");
  await expect(current).not.toHaveText(rejectedTitle);
  await expect(review.getByText(/1 added · 1 rejected/)).toBeVisible();

  // Reading again never brings the rejected process back
  await page.goto("/discover");
  await page.getByRole("button", { name: "Read again" }).first().click();
  await expect(review.getByText("Is this work you do?")).toBeVisible({ timeout: 60_000 });
  const total = Number((await review.getByText(/^\d+ of \d+/).textContent())!.match(/of (\d+)/)![1]);
  const seen: string[] = [];
  for (let i = 0; i < total; i++) {
    const title = (await current.textContent())!;
    seen.push(title);
    await page.keyboard.press("ArrowDown");
    if (total > 1) await expect(current).not.toHaveText(title);
  }
  expect(seen).not.toContain(rejectedTitle);
  expect(seen).not.toContain("Customer invoice requests");
  await page.goto("/processes?status=draft");
  await page.getByRole("link", { name: "Customer invoice requests" }).click();
  await expect(page.getByText("Found in your systems")).toBeVisible();
  // The agent action proposed in discovery is kept with the process.
  await expect(page.getByText("What an agent would do")).toBeVisible();
  await expect(page.getByText(/an agent takes these steps/)).toBeVisible();
  await page.goto("/processes");

  // Approving a process finds its automation opportunities straight away
  await expect(page).toHaveURL(/\/processes/);
  await expect(page.getByRole("link", { name: "Refund request handling" })).toHaveCount(1);
  await page.getByRole("link", { name: "Refund request handling" }).click();
  await expect(page).toHaveURL(/\/processes\/[0-9a-f-]+/);
  const processUrl = page.url();
  // Refunds are a regulated area: the company's refund policy is set before any agent exists,
  // and approving asks who signs off on compliance.
  await expect(page.getByText("Your policy")).toBeVisible();
  await page.getByLabel("A person approves refunds or payments above").fill("40");
  await page.getByLabel("Never refund or pay more than, in one action").fill("300");
  await page.getByLabel("Refund window after purchase").fill("30");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.locator("#policy").getByText("Saved")).toBeVisible();
  await page.getByLabel("Compliance sign-off by").fill("Finance (Jo Park)");
  // A website draft nothing in the data backs is approved only once a person confirms it.
  await expect(page.getByRole("button", { name: "Approve process" })).toBeDisabled();
  await page.getByLabel(/I checked the steps and numbers/).check();
  await page.getByRole("button", { name: "Approve process" }).click();
  await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]+/);
  await expect(page.getByText("Proposed", { exact: true })).toBeVisible();
  const opportunityUrl = page.url().split("?")[0]!;
  await shot(page, "opportunity-found");

  // One click builds the agent from the proposal and runs a simulated test
  await page.getByRole("button", { name: "Build and test agent" }).click();
  await expect(page).toHaveURL(/\/activity\/[0-9a-f-]+\?built=1/);
  const agentUrl = new URL((await page.getByRole("link", { name: "Open agent" }).getAttribute("href"))!, page.url()).toString();

  // Test run: simulated, lists the approvals production would need
  await expect(page.getByText("Test passed")).toBeVisible();
  await expect(page.getByText("Approvals needed in production")).toBeVisible();

  // One eligibility state everywhere: with the refund window removed from the policy, the agent is
  // blocked, and no page offers Activate. Home, the agent list, the agent page and Settings agree.
  await page.goto(processUrl);
  await page.getByLabel("Refund window after purchase").fill("");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.locator("#policy").getByText("Saved")).toBeVisible();
  await page.goto("/agents");
  await expect(page.getByRole("link", { name: "View blockers" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Activate/ })).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "View blockers" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Activate it" })).toHaveCount(0);
  await page.goto(agentUrl);
  await expect(page.getByRole("button", { name: "Activate agent" })).toBeDisabled();
  await expect(page.getByTestId("agent-state")).toContainText("refund window after purchase");
  await page.goto("/settings");
  await expect(page.getByTestId("agent-readiness")).toContainText("Its process is described well enough");
  // With the policy complete again, every page offers it.
  await page.goto(processUrl);
  await page.getByLabel("Refund window after purchase").fill("30");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.locator("#policy").getByText("Saved")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Activate it" })).toBeVisible();

  // Activate and send a live sandbox ticket
  await page.goto(agentUrl);
  await page.getByRole("button", { name: "Activate agent" }).click();
  // Going live is confirmed, with the systems and what the agent can change there.
  const golive = page.getByRole("alertdialog");
  await expect(golive.getByText("What it can change")).toBeVisible();
  await golive.getByRole("button", { name: "Activate" }).click();
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
  await page.getByRole("button", { name: "Pause all agents" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Pause all agents" }).click();
  await expect(page.getByText(/All agents are paused/)).toBeVisible();
  await page.getByRole("button", { name: "Resume all agents" }).click();
  await expect(page.getByRole("button", { name: "Pause all agents" })).toBeVisible();

  // Add systems: the popular list first, and search across the whole directory (needs a Composio key)
  await page.goto("/integrations");
  // Each connected system was mapped once, when it was connected
  await expect(page.getByTestId("inventory-zendesk")).toHaveText(/1 sample data \(mapped /);
  await page.getByTestId("integration-zendesk").getByRole("button", { name: "What AutonomOS found" }).click();
  await expect(page.getByTestId("integration-zendesk").getByText("Sample zendesk records")).toBeVisible();
  const addSystems = page.getByRole("button", { name: "Add systems" });
  if (await addSystems.count()) {
    await addSystems.click();
    const sheet = page.getByRole("dialog", { name: "Add systems" });
    await expect(sheet.getByTestId("directory-gmail")).toBeVisible({ timeout: 20_000 });
    await expect(sheet.getByRole("list", { name: "Systems" }).getByRole("listitem")).toHaveCount(20);
    // Zendesk and Stripe are connected, so the next most common systems take their place
    await expect(sheet.getByTestId("directory-zendesk")).toHaveCount(0);
    await expect(sheet.getByTestId("directory-stripe")).toHaveCount(0);
    await expect(sheet.getByTestId("directory-googledocs")).toBeVisible();
    // Categories narrow the directory
    await sheet.getByRole("group", { name: "Categories" }).getByRole("button", { name: "Finance & accounting" }).click();
    await expect(sheet.getByTestId("directory-quickbooks")).toBeVisible({ timeout: 20_000 });
    await expect(sheet.getByTestId("directory-gmail")).toHaveCount(0);
    await sheet.getByRole("group", { name: "Categories" }).getByRole("button", { name: "All" }).click();
    await sheet.getByLabel("Search systems").fill("pipedrive");
    await expect(sheet.getByTestId("directory-pipedrive")).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("Escape");
  }

  // Phone layout: every page fits the screen width and the menu reaches every section
  await page.setViewportSize({ width: 390, height: 844 });
  const pages = [
    "/",
    "/approvals",
    "/approvals?view=resolved",
    "/processes",
    processUrl,
    "/opportunities",
    opportunityUrl,
    "/agents",
    agentUrl,
    "/activity",
    runUrl,
    "/discover",
    "/integrations",
    "/settings",
  ];
  for (const url of pages) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0)
      console.log(
        url,
        await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5)
            .slice(0, 8)
            .map((e) => `${e.tagName}.${String(e.className).slice(0, 120)} r=${e.getBoundingClientRect().right}`),
        ),
      );
    expect(overflow, `${url} is wider than the screen`).toBeLessThanOrEqual(0);
    if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/${url.replace(/^https?:\/\/[^/]+/, "").replace(/[^a-z0-9]+/gi, "_") || "_"}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("dialog", { name: "Sidebar" }).getByRole("link", { name: "Agents" }).click();
  await expect(page).toHaveURL(/\/agents$/);
  await expect(page.getByRole("dialog", { name: "Sidebar" })).toHaveCount(0);
});
