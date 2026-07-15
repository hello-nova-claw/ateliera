import { expect, test } from '@playwright/test';
import { enterCreatedStudio } from './helpers/studio';

test('renders the accessible Studio shell', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a new Studio Space' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await enterCreatedStudio(page);

  await expect(page.getByRole('main', { name: 'Ateliera' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ateliera' })).toBeVisible();
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

test('limits rendered images to local, data, and ephemeral blob sources', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.locator('meta[http-equiv="Content-Security-Policy"]'),
  ).toHaveAttribute('content', /img-src 'self' data: blob:/);
});
