import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const screenshotsDirectory = path.resolve('artifacts/visual/task-2');

test.beforeAll(async () => {
  await mkdir(screenshotsDirectory, { recursive: true });
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`Card primitives are accessible at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/iframe.html?id=primitives-card--reflection&viewMode=story');
    await expect(page.getByRole('article', { name: 'What I learned' })).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({
      path: path.join(screenshotsDirectory, `card-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
    await expect(page).toHaveScreenshot(`card-${viewport.width}x${viewport.height}.png`, {
      fullPage: true,
    });
  });
}
