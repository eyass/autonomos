import { expect, test } from "@playwright/test";

// A site administrator drafts a playbook for a tool with AI, edits and publishes it; a
// workspace starts from it and builds and tests its agent.
test("ready-made playbooks: studio to agent", async ({ page }) => {
  const email = process.env.E2E_PLATFORM_ADMIN!;
  const title = `Ticket follow-up ${Date.now()}`;
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Admin");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Your company" })).toBeVisible();
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
  await page.getByLabel("Tool").selectOption("zendesk");
  await page.getByLabel(/What it should do/).fill("Follow up on tickets waiting on the customer");
  await page.getByRole("button", { name: "Draft with AI" }).click();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByTestId("playbook-library").getByText("Zendesk follow-up").count();
      },
      { timeout: 60_000, intervals: [2_000] },
    )
    .toBeGreaterThan(0);
  await page
    .getByTestId("playbook-library")
    .getByRole("link", { name: /Zendesk follow-up/ })
    .first()
    .click();

  // Review: rename it, then publish.
  await expect(page.getByLabel("Title")).toHaveValue("Zendesk follow-up");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Minutes each time").fill("8");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  // A workspace starts from it: its tools are connected, so it is ready to use.
  await page.goto("/playbooks");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Minutes each time")).toHaveValue("8");
  await page.getByLabel("Times a month").fill("120");
  await page.getByRole("button", { name: "Use this playbook" }).click();
  await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]+\?playbook=1/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // Building uses the playbook's agent as written, then tests it.
  await page.getByRole("button", { name: "Build and test agent" }).click();
  await expect(page).toHaveURL(/\/activity\/[0-9a-f-]+\?built=1/, { timeout: 90_000 });
  await page.goto("/agents");
  await expect(page.getByText(title).first()).toBeVisible();
});
