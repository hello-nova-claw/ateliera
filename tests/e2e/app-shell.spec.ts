import { expect, test } from '@playwright/test';

test('renders the accessible Studio shell', async ({ page }, testInfo) => {
  await page.goto('/');

  await expect(page.getByRole('main', { name: 'The Studio' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Studio' })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('studio-shell.png'),
    fullPage: true,
  });
});

test('publishes a native-size Apple touch icon', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/apple-touch-icon.png',
  );
  const dimensions = await page.evaluate(async () => {
    const image = new Image();
    image.src = '/apple-touch-icon.png';
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  expect(dimensions).toEqual({ width: 180, height: 180 });
});
