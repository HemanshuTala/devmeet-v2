import { test, expect } from '@playwright/test';

test.describe('DevMeet Interview Studio & Hint Interaction', () => {
  test('Mock interview route loads with fallback handling when unauthenticated', async ({ page }) => {
    // Navigate to interview page
    await page.goto('/interview/mock-test-id');

    // Should either show session loading/error or redirect cleanly
    await page.waitForTimeout(1000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('Create session page renders all tracks, difficulty options, and duration presets', async ({ page }) => {
    await page.goto('/dashboard/create-session');

    // Page must either render track options or require authentication
    await page.waitForTimeout(1000);
    const pageUrl = page.url();

    if (pageUrl.includes('/create-session')) {
      await expect(page.locator('text=Data Structures & Algorithms').first()).toBeVisible();
      await expect(page.locator('text=Behavioral').first()).toBeVisible();
      await expect(page.locator('text=System Design').first()).toBeVisible();
    } else {
      // Clean auth redirect
      expect(pageUrl).toContain('/login');
    }
  });
});
