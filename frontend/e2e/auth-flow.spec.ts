import { test, expect } from '@playwright/test';

test.describe('DevMeet Authentication Flow & Validation', () => {
  test('Login form renders with email, password fields and validation', async ({ page }) => {
    await page.goto('/login');

    // Email and password inputs must exist
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Trigger validation with empty/invalid inputs
    await emailInput.fill('invalid-email');
    await passwordInput.fill('123');
    await submitBtn.click();

    // Should stay on login and show validation feedback
    await expect(page).toHaveURL(/\/login/);
  });

  test('Registration page renders and allows switching to login', async ({ page }) => {
    await page.goto('/register');

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Link back to login
    const loginLink = page.getByRole('link', { name: /sign in|log in/i });
    await expect(loginLink).toBeVisible();
    await loginLink.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('Forgot password page renders with recovery instructions', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('text=Reset your password').first()).toBeVisible();
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
  });
});
