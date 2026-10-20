import { Page } from '@playwright/test';

/**
 * Sets up an authenticated session in Playwright for protected route testing.
 * Seeds localStorage tokens and mocks auth profile and billing endpoints.
 */
export async function setupAuthenticatedUser(page: Page) {
  // Pre-seed localStorage before page scripts execute
  await page.addInitScript(() => {
    window.localStorage.setItem('access_token', 'mock_jwt_access_token_devmeet_e2e');
    window.localStorage.setItem('refresh_token', 'mock_jwt_refresh_token_devmeet_e2e');
  });

  // Intercept and mock identity profile check
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '11111111-2222-3333-4444-555555555555',
        email: 'e2e_candidate@devmeet.com',
        display_name: 'E2E Candidate',
        role: 'user',
        plan: 'free',
        profile_public: true,
      }),
    });
  });

  // Intercept and mock quota endpoint
  await page.route('**/api/v1/users/quota', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan: 'free',
        interviews_today: 1,
        interviews_this_month: 2,
        daily_limit: 5,
        monthly_limit: 5,
        remaining_today: 4,
        remaining_this_month: 3,
      }),
    });
  });

  // Intercept and mock subscription check for billing page
  await page.route('**/api/v1/payments/subscription*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan: 'free',
        status: 'active',
        current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        cancel_at_period_end: false,
      }),
    });
  });

  // Intercept and mock plans catalog for billing page
  await page.route('**/api/v1/payments/plans', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plans: [
          {
            plan: 'free',
            name: 'DevMeet Free',
            amount_paise: 0,
            price_display: 'Free',
            currency: 'INR',
            features: ['5 free mock interviews', 'DSA mode only'],
          },
          {
            plan: 'pro',
            name: 'DevMeet Pro',
            amount_paise: 159900,
            price_display: '₹1,599/month',
            currency: 'INR',
            features: ['Unlimited interviews', 'All interview modes'],
          },
          {
            plan: 'enterprise',
            name: 'DevMeet Enterprise',
            amount_paise: 0,
            price_display: 'Contact sales',
            currency: 'INR',
            features: ['Everything in Pro', 'Custom question bank'],
          },
        ],
      }),
    });
  });
}
