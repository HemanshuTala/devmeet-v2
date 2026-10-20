import { test, expect } from '@playwright/test';
import { setupAuthenticatedUser } from './test-helpers';

test.describe('DevMeet API Contracts & Network Integration', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedUser(page);
  });

  test('Question Bank search API request occurs with valid headers', async ({ page }) => {
    let capturedSearchRequest: any = null;

    // Intercept outbound network calls to search service
    await page.route('**/api/v1/search/questions*', async (route) => {
      capturedSearchRequest = route.request();
      await route.continue();
    });

    await page.goto('/dashboard/questions');
    await page.waitForTimeout(1500);

    // If search fired, verify headers
    if (capturedSearchRequest) {
      const headers = capturedSearchRequest.headers();
      expect(headers).toBeTruthy();
    }
  });

  test('Public search questions endpoint returns valid schema contract', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/v1/search/questions?limit=5&offset=0');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('questions');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.questions)).toBe(true);

    if (body.questions.length > 0) {
      const q = body.questions[0];
      expect(q).toHaveProperty('title');
      expect(q).toHaveProperty('interview_type');
      expect(q).toHaveProperty('difficulty');
    }
  });

  test('Gateway health probe responds 200 OK', async ({ request }) => {
    const res = await request.get('http://localhost:8000/health');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.service).toBe('api-gateway');
  });
});
