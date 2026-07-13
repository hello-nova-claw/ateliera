import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/visual/task-12-foyer');

test.beforeAll(async () => {
  await mkdir(output, { recursive: true });
});

for (const fixture of [
  'empty',
  'partial',
  'full',
  'dense',
  'loading',
  'index-stale',
  'offline',
  'error',
  'missing-image',
  'dark',
] as const) {
  test(`${fixture} Foyer is axe-clean and visually reviewable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/iframe.html?id=rooms-foyer--${fixture}&viewMode=story`);
    await expect(
      page.getByRole('heading', { name: 'The Studio' }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: path.join(output, `${fixture}-1440x1000.png`),
      fullPage: true,
    });
  });
}

for (const viewport of [
  { name: 'compact', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'zoom-200', width: 720, height: 1000 },
] as const) {
  test(`full Foyer reflows at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/iframe.html?id=rooms-foyer--full&viewMode=story');
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: path.join(output, `full-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  });
}

test('Foyer respects reduced motion and forced colors', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.goto('/iframe.html?id=rooms-foyer--full&viewMode=story');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page
      .locator('.foyer-polaroid')
      .evaluate((element) => getComputedStyle(element).transform),
  ).toBe('none');
  await page.screenshot({
    path: path.join(output, 'full-forced-reduced.png'),
    fullPage: true,
  });
});
