import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function createLocalStudio(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('Landscape Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
}

async function addHomeVision(page: Page, title = 'A calm home'): Promise<void> {
  await page.getByRole('button', { name: 'Open Home' }).click();
  await page.getByRole('region', { name: 'Vision' }).getByRole('button', { name: '+ Add' }).click();
  await page.getByRole('textbox', { name: 'What would you like remembered?' }).fill(title);
  await page.getByRole('button', { name: 'Remember' }).click();
  await expect(page.getByRole('button', { name: title })).toBeVisible();
}

test('moves through matrix, focus, and lens without page overflow', async ({ page }, testInfo) => {
  await createLocalStudio(page);
  await page.getByRole('link', { name: 'Life Landscape' }).click();
  await expect(page.getByRole('region', { name: 'Life Landscape matrix' })).toBeVisible();
  await addHomeVision(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole('button', { name: 'Lens' }).click();
  await expect(page.getByRole('heading', { name: 'Vision' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'A calm home' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('landscape-lens.png'), fullPage: true });
});

test('moves, links, and undoes one canonical note', async ({ page }) => {
  await createLocalStudio(page);
  await page.getByRole('link', { name: 'Life Landscape' }).click();
  await addHomeVision(page);

  await page.getByRole('button', { name: 'Move A calm home' }).click();
  await page.getByRole('menuitem', { name: /Move to Practices/ }).click();
  await expect(page.getByRole('region', { name: 'Practices' }).getByRole('button', { name: 'A calm home' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo move' }).click();
  await expect(page.getByRole('region', { name: 'Vision' }).getByRole('button', { name: 'A calm home' })).toBeVisible();

  await page.getByRole('button', { name: 'Move A calm home' }).click();
  await page.getByRole('menuitem', { name: 'Also show in Family' }).click();
  await page.getByRole('button', { name: 'Family', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Vision' }).getByRole('button', { name: 'A calm home' })).toBeVisible();
});

test('mobile routes directly to one area and never renders the matrix', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createLocalStudio(page);
  await page.goto('/landscape/home');
  await page.getByRole('button', { name: 'Open Landscape Studio' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.locator('.life-landscape__matrix')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
