import { expect, test } from "@playwright/test";

// A site administrator drafts a tool-neutral playbook with AI, edits and publishes it; a
// workspace connects its own tool to each step, starts from it and builds and tests its agent.
test("ready-made playbooks: studio to agent", async ({ page }) => {
  const email = process.env.E2E_PLATFORM_ADMIN!;
  const title = `Refunds ${Date.now()}`;
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Admin");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Your company", exact: true })).toBeVisible();
  await page.getByLabel("Company website").fill("http://127.0.0.1:3999/site");
  await page.getByRole("button", { name: "Read my website" }).click();
  await expect(page.getByLabel("Company name")).toHaveValue("Acme Furniture");
  await page.getByRole("button", { name: "Create company" }).click();
  const zendesk = page.getByTestId("integration-zendesk");
  await zendesk.getByRole("button", { name: "Connect" }).click();
  await zendesk.getByRole("button", { name: "Use sandbox data" }).click();
  await expect(zendesk.getByText(/Connected/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding\/mapping$|\/processes/, { timeout: 60_000 });

  // The studio is only in the navigation for site administrators.
  await page.goto("/");
  await page.getByRole("link", { name: "Playbook studio" }).first().click();
  await expect(page.getByRole("heading", { name: "Playbook studio" })).toBeVisible();
  await page.getByLabel("Department").selectOption("Customer Support");
  await page.getByLabel(/What it should do/).fill("Handle refund requests against the refund policy");
  await page.getByRole("button", { name: "Draft with AI" }).click();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page
          .getByTestId("playbook-library")
          .getByRole("link", { name: /Refund request handling/ })
          .count();
      },
      { timeout: 60_000, intervals: [2_000] },
    )
    .toBeGreaterThan(0);
  await page
    .getByTestId("playbook-library")
    .getByRole("link", { name: /Refund request handling/ })
    .first()
    .click();

  // Review: the steps name the kind of system, never a product. Rename it, then publish.
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Refund request handling");
  await expect(page.getByTestId("step-row")).toHaveCount(5);
  await expect(page.getByLabel("Step 1 system")).toHaveValue("helpdesk");
  await expect(page.getByLabel("Step 2 system")).toHaveValue("payments");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Minutes each time").fill("8");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  // In the workspace: the gallery opens on the company's industry, with the ready-made
  // library for it and playbooks that suit any industry.
  await page.goto("/playbooks");
  await expect(page.getByLabel("Industry")).toHaveValue("Marketplaces");
  await expect(page.getByRole("link", { name: /New listing moderation/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Weekly client performance report/ })).toHaveCount(0);
  // In the workspace: the help desk is connected (Zendesk), the payment system is not yet.
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByLabel("Help desk", { exact: true })).toHaveValue("zendesk");
  await expect(page.getByRole("button", { name: "Use this playbook" })).toBeDisabled();
  // Connect a payment system right from the step.
  await page.getByTestId("slot-payments").getByRole("button", { name: "Sample data" }).first().click();
  await expect(page.getByLabel("Payments", { exact: true })).toHaveValue("stripe");
  await expect(page.getByTestId("playbook-steps").getByText("Stripe").first()).toBeVisible();
  await expect(page.getByLabel("Minutes each time")).toHaveValue("8");
  await page.getByLabel("Times a month").fill("120");
  await page.getByLabel("Who signs off on compliance").fill("Finance lead");
  await page.getByLabel("A person approves refunds or payments above").fill("40");
  await page.getByLabel("Never refund or pay more than, in one action").fill("300");
  await page.getByLabel("Refund window after purchase").fill("30");
  await page.getByRole("button", { name: "Use this playbook" }).click();
  await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]+\?playbook=1/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(/Check the payment \(Stripe\)/)).toBeVisible();

  // Building uses the playbook's agent with the actions of these tools, then tests it.
  await page.getByRole("button", { name: "Build and test agent" }).click();
  await expect(page).toHaveURL(/\/activity\/[0-9a-f-]+\?built=1/, { timeout: 90_000 });
  await page.goto("/agents");
  await expect(page.getByText(title).first()).toBeVisible();
});
