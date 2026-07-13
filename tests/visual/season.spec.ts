import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/visual/task-14-season');
test.beforeAll(async () => {
  await mkdir(output, { recursive: true });
});

for (const fixture of [
  'active',
  'empty',
  'wizard',
  'conflict',
  'long-text',
  'dark',
] as const) {
  test(`${fixture} Current Season is axe-clean and reviewable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(
      `/iframe.html?id=rooms-current-season--${fixture}&viewMode=story`,
    );
    await expect(
      page.locator('.season-page h1, .season-wizard h1, .season-empty h1'),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: path.join(output, `${fixture}-1440x1000.png`),
      fullPage: true,
    });
  });
}

for (const viewport of [
  { name: 'compact', width: 1024, height: 768 },
  { name: 'zoom-200', width: 720, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`Current Season reflows at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(
      '/iframe.html?id=rooms-current-season--active&viewMode=story',
    );
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
      path: path.join(
        output,
        `active-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  });
}

test('Current Season respects reduced motion and forced colors', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.goto(
    '/iframe.html?id=rooms-current-season--active&viewMode=story',
  );
  await expect(page.locator('.season-page h1')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: path.join(output, 'active-forced-reduced.png'),
    fullPage: true,
  });
});
