import { expect, test } from '@playwright/test';

test('renders the accessible Studio shell', async ({ page }, testInfo) => {
  await page.goto('/');

  await expect(page.getByRole('main', { name: 'The Studio' })).toBeVisible();
  await expect(page.getByText('The Studio')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('studio-shell.png'), fullPage: true });
});
