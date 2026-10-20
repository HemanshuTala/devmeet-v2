import { test, expect } from '@playwright/test';

test.describe('DevMeet Landing & Navigation Flow', () => {
  test('Landing page loads with hero banner, CTA, and brand identity', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle(/DevMeet/i);

    // Check visible navigation brand link
    const headerBrand = page.getByRole('navigation').getByRole('link', { name: 'DevMeet' }).first();
    await expect(headerBrand).toBeVisible();

    // Check hero heading
    const heroHeading = page.getByRole('heading', { level: 1, name: /Nail Your Next/i });
    await expect(heroHeading).toBeVisible();

    // Check navigation sign-in button
    const signInBtn = page.getByRole('navigation').getByRole('link', { name: /sign in/i });
    await expect(signInBtn).toBeVisible();

    // Check hero CTA button
    const ctaBtn = page.getByRole('link', { name: /get started free/i });
    await expect(ctaBtn).toBeVisible();
  });

  test('Privacy policy page loads cleanly with legal headings', async ({ page }) => {
    await page.goto('/privacy');
    const heading = page.getByRole('heading', { level: 1, name: /privacy policy/i });
    await expect(heading).toBeVisible();
    await expect(page.getByText('Information We Collect').first()).toBeVisible();
  });

  test('Terms of service page loads cleanly with legal headings', async ({ page }) => {
    await page.goto('/terms');
    const heading = page.getByRole('heading', { level: 1, name: /terms of service/i });
    await expect(heading).toBeVisible();
    await expect(page.getByText('Acceptable Conduct').first()).toBeVisible();
  });

  test('Landing page pricing section displays plans and features', async ({ page }) => {
    await page.goto('/');

    // Check pricing section heading
    const pricingHeader = page.getByRole('heading', { level: 2, name: /Invest in Your Next Career Move/i });
    await expect(pricingHeader).toBeVisible();

    // Check Free and Pro plan cards
    await expect(page.getByRole('heading', { level: 3, name: /Free Starter/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: /DevMeet Pro/i })).toBeVisible();
  });
});
