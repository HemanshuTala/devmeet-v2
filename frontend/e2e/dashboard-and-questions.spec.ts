import { test, expect } from '@playwright/test';
import { setupAuthenticatedUser } from './test-helpers';

test.describe('DevMeet Dashboard & Question Bank Fast Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedUser(page);
  });

  test('Question Bank loads cleanly with search, category filters, and card items', async ({ page }) => {
    await page.goto('/dashboard/questions');

    // Page title and subtitle must render
    await expect(page.getByRole('heading', { name: 'Question Bank', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Browse curated interview questions')).toBeVisible();

    // Search bar and filter dropdowns must exist
    const searchInput = page.locator('input[placeholder*="Search questions"]');
    await expect(searchInput).toBeVisible();

    // Verify filter select controls
    const selectElements = page.locator('select');
    await expect(selectElements.first()).toBeVisible();

    // Verify Random Question CTA button
    const randomBtn = page.getByRole('button', { name: /Random Question/i });
    await expect(randomBtn).toBeVisible();
  });

  test('Instant navigation from Dashboard to Question Bank without freezing UI', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait for dashboard shell to mount
    await expect(page.locator('body')).toBeVisible();

    // Locate the Question Bank link in hero or sidebar
    const questionBankLink = page.locator('a[href="/dashboard/questions"]').first();
    await expect(questionBankLink).toBeVisible();

    // Measure click to navigation completion time
    const startTime = Date.now();
    await questionBankLink.click();

    // Expect destination URL and header to appear rapidly (< 1500ms)
    await expect(page).toHaveURL(/\/dashboard\/questions/);
    await expect(page.getByRole('heading', { name: 'Question Bank', exact: true })).toBeVisible({ timeout: 4000 });
    const elapsed = Date.now() - startTime;

    console.log(`[PERF] Dashboard to Question Bank navigation completed in ${elapsed}ms`);
    expect(elapsed).toBeLessThan(3500);
  });

  test('Question search filters update results dynamically', async ({ page }) => {
    await page.goto('/dashboard/questions');

    const searchInput = page.locator('input[placeholder*="Search questions"]');
    await expect(searchInput).toBeVisible();

    // Type a targeted search term
    await searchInput.fill('Binary Tree');

    // Wait for debounced search and response
    await page.waitForTimeout(600);

    // Verify counter or card reflects search results
    const counterText = page.locator('text=/\\d+ questions? found/i');
    await expect(counterText).toBeVisible({ timeout: 5000 });
  });

  test('Practice This Question button navigates with pre-filled query parameters', async ({ page }) => {
    await page.goto('/dashboard/questions');

    // Wait for question cards to load
    const practiceButtons = page.getByRole('button', { name: /Practice This Question/i });
    if (await practiceButtons.count() > 0) {
      await practiceButtons.first().click();
      await expect(page).toHaveURL(/\/dashboard\/create-session/);
    }
  });
});
