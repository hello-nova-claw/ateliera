import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const screenshotsDirectory = path.resolve('artifacts/visual/task-10-editor-states');

test.beforeAll(async () => {
  await mkdir(screenshotsDirectory, { recursive: true });
});

for (const state of ['recovery', 'conflict', 'busy', 'error'] as const) {
  test(`${state} editor state is accessible and visually reviewable`, async ({ page }) => {
    await page.setViewportSize({ width: 980, height: 900 });
    await page.goto(
      `/iframe.html?id=primitives-cardeditor--${state}&viewMode=story`,
    );
    await expect(page.getByRole('article', { name: 'Note editor' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: path.join(screenshotsDirectory, `${state}.png`),
      fullPage: true,
    });
  });
}
