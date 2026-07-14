import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { analyzeStory } from './axe';

const output = path.resolve('artifacts/visual/task-13-landscape');

test.beforeAll(async () => { await mkdir(output, { recursive: true }); });

for (const fixture of ['empty', 'sparse-matrix', 'dense-matrix', 'focus', 'lens', 'dark-focus'] as const) {
  test(`${fixture} Landscape is axe-clean and reviewable`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/iframe.html?id=rooms-life-landscape--${fixture}&viewMode=story`);
    await expect(page.getByRole('heading', { name: 'Life Landscape' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect((await analyzeStory(page)).violations).toEqual([]);
    await page.screenshot({ path: path.join(output, `${fixture}-1440x1000.png`), fullPage: true });
  });
}

for (const viewport of [
  { name: 'compact', width: 1024, height: 768 },
  { name: 'zoom-200', width: 720, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`focused Landscape reflows at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/iframe.html?id=rooms-life-landscape--focus&viewMode=story');
    await expect(page.getByRole('heading', { name: 'Life Landscape' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect((await analyzeStory(page)).violations).toEqual([]);
    await page.screenshot({ path: path.join(output, `focus-${viewport.width}x${viewport.height}.png`), fullPage: true });
  });
}

test('Landscape respects reduced motion and forced colors', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.goto('/iframe.html?id=rooms-life-landscape--focus&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Life Landscape' })).toBeVisible();
  expect((await analyzeStory(page)).violations).toEqual([]);
  await page.screenshot({ path: path.join(output, 'focus-forced-reduced.png'), fullPage: true });
});
