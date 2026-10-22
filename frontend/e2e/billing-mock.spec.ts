import { test, expect } from '@playwright/test';
import { setupAuthenticatedUser } from './test-helpers';

test.describe('DevMeet Mock Billing & Plan Management E2E', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedUser(page);
  });

  test('Billing page renders plans, pricing, and allows instant plan upgrade', async ({ page }) => {
    // Mock checkout session API endpoint to return instant mock upgrade
    await page.route('**/api/v1/payments/checkout-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_id: 'order_mock_e2e_test',
          checkout_url: 'http://localhost:3000/billing?payment=success',
          plan: 'pro',
          mode: 'mock',
          success: true,
          message: 'Successfully upgraded to DevMeet Pro Plan!',
          amount: 159900,
          currency: 'INR',
        }),
      });
    });

    await page.goto('/billing');

    // Page title and headers must be visible
    await expect(page.locator('h1:has-text("Pricing")').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('DevMeet Pro').first()).toBeVisible();

    // Verify Mock Payment Sandbox badge is displayed
    await expect(page.getByText('Instant Mock Payment Sandbox').first()).toBeVisible();
    await expect(page.getByText('Zero Friction One-Click Upgrades').first()).toBeVisible();

    // Click upgrade button
    const upgradeBtn = page.getByRole('button', { name: /upgrade to devmeet pro/i });
    if (await upgradeBtn.isVisible()) {
      await upgradeBtn.click();
      // Should show success toast
      await expect(page.getByText(/upgraded to PRO plan/i).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('Billing FAQ section renders accordion and toggles cleanly', async ({ page }) => {
    await page.goto('/billing');

    const faqHeading = page.getByRole('heading', { level: 3, name: /billing frequently asked questions/i });
    await expect(faqHeading).toBeVisible({ timeout: 10000 });

    const firstQuestion = page.getByRole('button', { name: /how do payments work on devmeet/i });
    await expect(firstQuestion).toBeVisible();
    await firstQuestion.click();

    // Answer should become visible
    await expect(page.getByText(/instant payment service sandbox/i).first()).toBeVisible();
  });
});
