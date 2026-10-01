import { expect, type Page } from "@playwright/test";

// The required onboarding step: add one piece of company knowledge (pasted text) and go on.
export async function addKnowledge(page: Page) {
  await expect(page.getByRole("heading", { name: "Teach AutonomOS about you" })).toBeVisible();
  await page.getByRole("button", { name: "Paste text instead" }).click();
  await page.getByPlaceholder("Title, for example Refund policy").fill("Refund policy");
  await page.getByLabel("Text to add").fill("Refunds are paid within 14 days of delivery for damaged items. Refunds above 250 euro are checked by a team lead.");
  await page.getByRole("button", { name: "Add text" }).click();
  const sources = page.getByTestId("knowledge-sources");
  await expect(sources.getByText("Refund policy")).toBeVisible();
  // Read on the worker (the stub runs the same code), and folded into the brief.
  await expect(sources.locator("li", { hasText: "Refund policy" }).getByText("Read", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("company-brief")).toContainText("Refunds are paid within 14 days", { timeout: 30_000 });
  await page.getByRole("button", { name: "Continue" }).click();
}
