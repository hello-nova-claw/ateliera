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

test('draws a reopened Studio with its own rooms from the first frame', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a new Studio Space' }).click();
  await page.getByLabel('Studio name').fill('Small Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await enterCreatedStudio(page);

  // A new Studio shows only its core rooms. Every list of room links the
  // page ever draws is recorded, so a frame that shows every room before the
  // preferences arrive is caught however briefly it lasts.
  await page.addInitScript(() => {
    const frames: string[] = [];
    Reflect.set(window, '__roomNavigationFrames', frames);
    new MutationObserver(() => {
      const nav = document.querySelector('nav[aria-label="Studio rooms"]');
      if (nav === null) return;
      const frame = [...nav.querySelectorAll('a')]
        .map((link) => link.lastElementChild?.textContent?.trim() ?? '')
        .join(' | ');
      if (frames.at(-1) !== frame) frames.push(frame);
    }).observe(document, { attributes: true, childList: true, subtree: true });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Open Small Studio' }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Ateliera' })).toBeVisible();

  expect(
    await page.evaluate(() => Reflect.get(window, '__roomNavigationFrames')),
  ).toEqual(['Foyer | Life Landscape']);
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
