import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/visual/task-16-search');
test.beforeAll(async () => { await mkdir(output, { recursive: true }); });

for (const fixture of ['results', 'empty', 'loading', 'offline', 'error', 'dense', 'dark'] as const) {
  test(`${fixture} Search is calm, safe, and axe-clean`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/iframe.html?id=rooms-search--${fixture}&viewMode=story`);
    await expect(page.locator('.search-page h1')).toHaveText('Search');
    await page.evaluate(() => document.fonts.ready);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);
    await page.screenshot({
      path: path.join(output, `search-${fixture}-1440x1000.png`),
      fullPage: true,
    });
  });
}

for (const viewport of [
  { name: 'zoom-200', width: 720, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`Search reflows at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/iframe.html?id=rooms-search--results&viewMode=story');
    await page.getByRole('button', { name: 'Filters' }).click();
    await page.evaluate(() => document.fonts.ready);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);
    await page.screenshot({
      path: path.join(output, `search-results-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  });
}

test('Search respects forced colors and reduced motion', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('/iframe.html?id=rooms-search--results&viewMode=story');
  await page.getByRole('button', { name: 'Filters' }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: path.join(output, 'search-forced-reduced.png'),
    fullPage: true,
  });
});
