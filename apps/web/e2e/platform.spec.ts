import { expect, test } from "@playwright/test";

// Sample workspace, workspace switching, approval limits and API keys.
test("sample workspace, approval limits and API keys", async ({ page, request }) => {
  const email = `e2e-platform-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Pat");
  await page.getByLabel("Last name").fill("Platform");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Your company" })).toBeVisible();
  await page.getByLabel("Company website").fill("http://127.0.0.1:3999/site");
  await page.getByRole("button", { name: "Read my website" }).click();
  await expect(page.getByLabel("Company name")).toHaveValue("Acme Furniture");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Work" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Your first agent")).toBeVisible();

  // The sample workspace runs a real agent on sample tickets.
  await page.getByRole("button", { name: "Explore a sample workspace" }).click();
  await expect(page.getByText(/Sample workspace\. The company and its customers are fictional/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Northwind Marketplace (sample)").first()).toBeVisible();
  await expect
    .poll(
      async () => {
        await page.goto("/approvals");
        return page.getByTestId("approval-card").count();
      },
      { timeout: 60_000, intervals: [2_000] },
    )
    .toBeGreaterThan(0);

  // An approval limit below the refund amount blocks the approval.
  await page.goto("/settings#members");
  const me = page.locator("li", { hasText: email });
  await me.getByLabel(/Approval limit/).fill("10");
  await me.getByRole("button", { name: "Set limit" }).click();
  await expect(me.getByText(/Approves up to 10/)).toBeVisible();
  await page.goto("/approvals");
  const card = page.getByTestId("approval-card").first();
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/above your approval limit/)).toBeVisible();

  // API keys: shown once, read-only by default, work as a bearer token, stop working when revoked.
  await page.goto("/settings#developers");
  await page.getByLabel("Key name").fill("Integration key");
  await page.getByRole("button", { name: "Create API key" }).click();
  const key = (await page.getByRole("alert").filter({ hasText: "shown only once" }).locator("code").textContent())!.trim();
  const ok = await request.get("/api/agents", { headers: { Authorization: `Bearer ${key}` } });
  expect(ok.status()).toBe(200);
  expect(JSON.stringify(await ok.json())).toContain(`"status":"active"`);
  const write = await request.post("/api/processes", { headers: { Authorization: `Bearer ${key}` }, data: { title: "Should not be created" } });
  expect(write.status()).toBe(403);
  const bad = await request.get("/api/agents", { headers: { Authorization: "Bearer aos_live_nope" } });
  expect(bad.status()).toBe(401);
  await page.reload();
  await page.locator("#developers li", { hasText: "Integration key" }).getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.locator("#developers li", { hasText: "Integration key" }).getByText("Revoked", { exact: true })).toBeVisible();
  expect((await request.get("/api/agents", { headers: { Authorization: `Bearer ${key}` } })).status()).toBe(401);

  // Switch back to the real workspace.
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(email) }).click();
  await page.getByRole("menuitem", { name: "Acme Furniture" }).click();
  await expect(page.getByText(/Sample workspace\. The company/)).toHaveCount(0);
  await expect(page.getByText("Acme Furniture").first()).toBeVisible();

  // Rename and delete a workspace: the sample one is renamed, then deleted, and the app
  // moves to the remaining workspace.
  await page.getByRole("button", { name: new RegExp(email) }).click();
  await page.getByRole("menuitem", { name: "Northwind Marketplace (sample)" }).click();
  await expect(page.getByText(/Sample workspace\. The company/)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(email) }).click();
  await page.getByRole("menuitem", { name: "Manage workspaces" }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
  await expect(page.getByRole("link", { name: "Add workspace" })).toBeVisible();
  const current = page.getByTestId("current-workspace");
  await current.getByLabel("Workspace name").fill("Northwind test");
  await current.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByText("Northwind test").first()).toBeVisible();
  await page.reload();
  await current.getByRole("button", { name: "Delete workspace", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
  await dialog.getByLabel("Workspace name to confirm").fill("Northwind test");
  await dialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:3100\/$/);
  await expect(page.getByText("Acme Furniture").first()).toBeVisible();
  await page.getByRole("button", { name: new RegExp(email) }).click();
  await expect(page.getByRole("menuitem", { name: /Northwind/ })).toHaveCount(0);

  // Sign out from the account menu ends the session.
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login/);
});
