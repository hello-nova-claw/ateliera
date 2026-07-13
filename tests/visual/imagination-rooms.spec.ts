import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/visual/task-15-imagination');
test.beforeAll(async () => { await mkdir(output, { recursive: true }); });

for (const fixture of ['sparse', 'empty', 'dense', 'long-text', 'dark'] as const) {
  test(`${fixture} Uncharted is axe-clean and pressure-free`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/iframe.html?id=rooms-uncharted--${fixture}&viewMode=story`);
    await expect(page.locator('.uncharted-page h1')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page.locator('.uncharted-page')).not.toContainText(
      /\b(?:due|overdue|progress|streak|deadline|status)\b/i,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: path.join(output, `uncharted-${fixture}-1440x1000.png`), fullPage: true });
  });
}

for (const fixture of ['garden', 'empty', 'dense', 'loading', 'malformed', 'dark'] as const) {
  test(`${fixture} Reflection Garden is axe-clean and reviewable`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/iframe.html?id=rooms-reflection-garden--${fixture}&viewMode=story`);
    await expect(page.locator('.reflection-page h1')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: path.join(output, `reflection-${fixture}-1440x1000.png`), fullPage: true });
  });
}

for (const viewport of [
  { name: 'zoom-200', width: 720, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  for (const room of [
    { id: 'rooms-uncharted--sparse', selector: '.uncharted-page' },
    { id: 'rooms-reflection-garden--garden', selector: '.reflection-page' },
  ] as const) {
    test(`${room.id} reflows at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/iframe.html?id=${room.id}&viewMode=story`);
      await page.evaluate(() => document.fonts.ready);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({
        path: path.join(output, `${room.id}-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
    });
  }
}

test('imagination rooms respect forced colors and reduced motion', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  for (const room of ['rooms-uncharted--sparse', 'rooms-reflection-garden--garden']) {
    await page.goto(`/iframe.html?id=${room}&viewMode=story`);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: path.join(output, `${room}-forced-reduced.png`), fullPage: true });
  }
});

