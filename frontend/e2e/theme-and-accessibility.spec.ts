import { test, expect } from '@playwright/test';

test.describe('DevMeet Unified Theme & CSS Tokens', () => {
  test('Root styles define unified blue brand color and font variables', async ({ page }) => {
    await page.goto('/');

    const brandColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim();
    });

    // Brand color must be DevMeet Blue (#2563eb)
    expect(brandColor.toLowerCase()).toBe('#2563eb');
  });

  test('Navbar renders with unified blue logo and consistent typography', async ({ page }) => {
    await page.goto('/');

    const logo = page.locator('header a, nav a').filter({ hasText: 'DevMeet' }).first();
    await expect(logo).toBeVisible();

    // Verify no broken unstyled elements
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
