import { expect, test } from '@playwright/test';

test('serves anti-clickjacking and local-only content policy headers', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();

  expect(response.ok()).toBe(true);
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).not.toMatch(/https:\/\/|\*/);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
});
