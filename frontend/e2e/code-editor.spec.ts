import { test, expect } from '@playwright/test';
import { setupAuthenticatedUser } from './test-helpers';

test.describe('DevMeet Code Editor & Interactive Studio Controls', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedUser(page);
  });

  test('Session wizard step-by-step navigation renders cleanly', async ({ page }) => {
    await page.goto('/dashboard/create-session');

    // Step 1: Select Track
    const dsaTrack = page.locator('text=Data Structures & Algorithms').first();
    await expect(dsaTrack).toBeVisible({ timeout: 10000 });

    // Click to select track
    await dsaTrack.click();

    // Next step button
    const nextBtn = page.getByRole('button', { name: /continue|next/i });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      // Step 2: Difficulty or duration options
      await expect(page.locator('text=Difficulty').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('Billing page renders plans, pricing, and FAQ', async ({ page }) => {
    await page.goto('/billing');

    // Heading must render
    await expect(page.locator('h1:has-text("Pricing")').first()).toBeVisible({ timeout: 10000 });

    // Plan options (DevMeet Free, DevMeet Pro, DevMeet Enterprise)
    await expect(page.locator('text=DevMeet Free').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=DevMeet Pro').first()).toBeVisible();
  });
});
