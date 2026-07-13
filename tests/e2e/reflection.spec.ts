import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function createLocalStudio(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('Reflection Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
}

async function openReflection(page: Page): Promise<void> {
  const link = page.getByRole('link', { name: 'Reflection Garden' });
  if (await link.isVisible()) await link.click();
  else {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Reflection Garden' }).click();
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Reflection Garden' })).toBeVisible();
}

test('keeps reflection and celebration as distinct chronological entries', async ({ page }, testInfo) => {
  await createLocalStudio(page);
  await openReflection(page);
  const sentence = page.getByLabel('A sentence to keep');
  await sentence.fill('I noticed that five quiet minutes changed the afternoon.');
  await page.getByRole('button', { name: 'Keep reflection' }).click();
  await expect(page.getByRole('heading', { name: 'I noticed that five quiet minutes changed the afternoon.' })).toBeVisible();

  await page.getByLabel('Entry meaning').selectOption('celebration');
  await sentence.fill('The small morning practice held.');
  await page.getByRole('button', { name: 'Keep celebration' }).click();
  await expect(page.getByRole('heading', { name: 'The small morning practice held.' })).toBeVisible();
  await page.getByRole('tab', { name: 'Celebration' }).click();
  await expect(page.getByRole('heading', { name: 'The small morning practice held.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'I noticed that five quiet minutes changed the afternoon.' })).toBeHidden();
  expect((await new AxeBuilder({ page }).include('.reflection-page').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('reflection-garden.png'), fullPage: true });

  await page.reload();
  await page.getByRole('button', { name: 'Open Reflection Studio' }).click();
  await openReflection(page);
  await expect(page.getByRole('heading', { name: 'The small morning practice held.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'I noticed that five quiet minutes changed the afternoon.' })).toBeVisible();
});

test('continues a new entry in the recoverable full editor', async ({ page }) => {
  await createLocalStudio(page);
  await openReflection(page);
  await page.getByLabel('A sentence to keep').fill('There is more I want to explore.');
  await page.getByRole('button', { name: 'Continue in the editor' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit note' })).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('There is more I want to explore.');
  await page.getByRole('button', { name: 'Close editor' }).click();
  await expect(page.getByRole('heading', { name: 'There is more I want to explore.' })).toBeVisible();
});

test('supports keyboard switching and one-column mobile reading', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile-specific composition proof.');
  await createLocalStudio(page);
  await openReflection(page);
  const garden = page.getByRole('tab', { name: 'Garden' });
  await garden.focus();
  await garden.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Reflection' })).toBeFocused();
  for (const button of await page.locator('.reflection-page button').all()) {
    if (!(await button.isVisible())) continue;
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
