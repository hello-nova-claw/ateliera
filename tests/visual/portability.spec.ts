import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/visual/task-17-portability');

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  await mkdir(output, { recursive: true });
});

async function openStory(page: Page, fixture: string): Promise<void> {
  await page.goto(
    `/iframe.html?id=rooms-settings-portability--${fixture}&viewMode=story`,
  );
  await expect(page.getByRole('heading', { name: 'Backup & restore' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function chooseBackup(page: Page): Promise<void> {
  await page.getByLabel('Choose a Studio backup').setInputFiles({
    name: 'the-studio-2026-07-14.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('storybook archive fixture'),
  });
  await expect(page.getByRole('heading', { name: 'Review this restore' })).toBeVisible();
}

async function expectAccessibleAndContained(page: Page): Promise<void> {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test('ready portability settings are spacious and axe-clean', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openStory(page, 'ready');
  await expectAccessibleAndContained(page);
  await page.screenshot({
    path: path.join(output, 'portability-ready-1440x1000.png'),
    fullPage: true,
  });
});

test('restore preview makes every pending change visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openStory(page, 'preview');
  await chooseBackup(page);
  await expect(page.getByRole('list', { name: 'Restore summary' })).toContainText(
    '2 to create',
  );
  await expectAccessibleAndContained(page);
  await page.screenshot({
    path: path.join(output, 'portability-preview-1440x1000.png'),
    fullPage: true,
  });
});

test('conflict preview keeps explicit choices calm and axe-clean', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openStory(page, 'conflict');
  await chooseBackup(page);
  await expect(page.getByRole('heading', { name: 'Resolve before restoring' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore this backup' })).toBeDisabled();
  await expectAccessibleAndContained(page);
  await page.screenshot({
    path: path.join(output, 'portability-conflict-1440x1000.png'),
    fullPage: true,
  });
});

test('dark portability settings retain the editorial hierarchy', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openStory(page, 'dark');
  await expectAccessibleAndContained(page);
  await page.screenshot({
    path: path.join(output, 'portability-dark-1440x1000.png'),
    fullPage: true,
  });
});

for (const viewport of [
  { name: 'zoom-200', width: 720, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`restore preview reflows at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openStory(page, 'preview');
    await chooseBackup(page);
    if (viewport.name === 'mobile') {
      const restoreSection = await page
        .getByRole('region', { name: 'Restore a Studio' })
        .boundingBox();
      const fileInput = await page
        .getByLabel('Choose a Studio backup')
        .boundingBox();
      expect(restoreSection).not.toBeNull();
      expect(fileInput).not.toBeNull();
      expect(fileInput!.x).toBeGreaterThanOrEqual(restoreSection!.x);
      expect(fileInput!.x + fileInput!.width).toBeLessThanOrEqual(
        restoreSection!.x + restoreSection!.width,
      );
    }
    await expectAccessibleAndContained(page);
    await page.screenshot({
      path: path.join(
        output,
        `portability-preview-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  });
}

test('conflict preview respects forced colors and reduced motion', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await openStory(page, 'conflict');
  await chooseBackup(page);
  await expectAccessibleAndContained(page);
  await page.screenshot({
    path: path.join(output, 'portability-conflict-forced-reduced.png'),
    fullPage: true,
  });
});
