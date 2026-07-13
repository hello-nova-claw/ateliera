import { expect, test } from '@playwright/test';

test('captured note survives reload while offline', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Capture' }).click();
  await page
    .getByRole('textbox', { name: 'What would you like remembered?' })
    .fill('The hill');
  await page.getByRole('button', { name: 'Remember' }).click();
  await expect(page.getByText('The hill')).toBeVisible();
  await expect(page.getByText('Ready offline')).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByText('The hill')).toBeVisible();
});

test('falls back to IndexedDB when OPFS is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: undefined,
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Capture' }).click();
  await page
    .getByRole('textbox', { name: 'What would you like remembered?' })
    .fill('The garden');
  await page.getByRole('button', { name: 'Remember' }).click();
  await page.reload();

  await expect(page.getByText('The garden')).toBeVisible();
});
