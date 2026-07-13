import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function createLocalStudio(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('Uncharted Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
}

async function openUncharted(page: Page): Promise<void> {
  const link = page.getByRole('link', { name: 'Uncharted' });
  if (await link.isVisible()) await link.click();
  else {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Uncharted' }).click();
  }
  await expect(page.getByRole('heading', { level: 1, name: 'What if…?' })).toBeVisible();
}

test('keeps near and beyond possibilities atomically across reload', async ({ page }, testInfo) => {
  await createLocalStudio(page);
  await openUncharted(page);
  const composer = page.getByLabel('What if…');
  await composer.fill('I returned to the childhood hill.');
  await page.getByRole('button', { name: 'Keep this possibility' }).click();
  await expect(page.getByRole('heading', { name: 'I returned to the childhood hill.' })).toBeVisible();

  await composer.fill('There is a gate I cannot name yet.');
  await page.getByLabel('Leave this beyond the gate').check();
  await page.getByRole('button', { name: 'Keep this possibility' }).click();
  const beyond = page.getByRole('heading', { name: 'There is a gate I cannot name yet.' }).locator('..');
  await expect(beyond).toHaveClass(/uncharted-card--beyond/);
  await expect(page.locator('.uncharted-page')).not.toContainText(
    /\b(?:due|overdue|progress|streak|deadline|status)\b/i,
  );
  expect((await new AxeBuilder({ page }).include('.uncharted-page').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('uncharted.png'), fullPage: true });

  await page.reload();
  await page.getByRole('button', { name: 'Open Uncharted Studio' }).click();
  await openUncharted(page);
  await expect(page.getByRole('heading', { name: 'I returned to the childhood hill.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'There is a gate I cannot name yet.' })).toBeVisible();
});

test('remains one calm column and locally writable on mobile', async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile-specific composition proof.');
  await createLocalStudio(page);
  await openUncharted(page);
  await context.setOffline(true);
  await page.getByLabel('What if…').fill('What if five quiet minutes were enough?');
  await page.getByRole('button', { name: 'Keep this possibility' }).click();
  await expect(page.getByRole('heading', { name: 'What if five quiet minutes were enough?' })).toBeVisible();
  const cards = await page.locator('.uncharted-card').all();
  const boxes = await Promise.all(cards.map((card) => card.boundingBox()));
  expect(boxes.every((box, index) => index === 0 || box!.y > boxes[index - 1]!.y)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
