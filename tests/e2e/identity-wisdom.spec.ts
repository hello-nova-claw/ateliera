import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { enterCreatedStudio, openExistingStudio } from './helpers/studio';

async function createLocalStudio(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a new Studio Space' }).click();
  await page.getByLabel('Studio name').fill('Inner Life Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await enterCreatedStudio(page);
}

test('keeps a practicing identity and makes it the current becoming', async ({
  page,
}, testInfo) => {
  await createLocalStudio(page);
  await page.getByRole('link', { name: 'Identity Studio' }).click();
  await expect(
    page.getByRole('heading', { name: 'Identity Studio', level: 1 }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Add a practice' }).click();
  await page.getByLabel('A short title (optional)').fill('Creating from calm');
  await page
    .getByLabel('What I am practicing')
    .fill('I let calm shape the next ordinary choice.');
  await page.getByRole('button', { name: 'Remember this practice' }).click();
  await page
    .getByRole('button', {
      name: 'Make Creating from calm currently becoming',
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Creating from calm', level: 2 }),
  ).toBeVisible();

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('identity-studio.png'),
  });
  await page.reload();
  await openExistingStudio(page, 'Inner Life Studio');
  await page.getByRole('link', { name: 'Identity Studio' }).click();
  await expect(
    page.getByRole('heading', { name: 'Creating from calm', level: 2 }),
  ).toBeVisible();
});

test('keeps sourced Wisdom and restores it by theme', async ({
  page,
}, testInfo) => {
  await createLocalStudio(page);
  await page.getByRole('link', { name: 'Wisdom Garden' }).click();
  await expect(
    page.getByRole('heading', { name: 'Wisdom Garden', level: 1 }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Add an idea' }).click();
  await page.getByLabel('Title (optional)').fill('Structure and surprise');
  await page
    .getByLabel('Idea')
    .fill('Create enough structure for imagination to surprise you.');
  await page.getByText('Source details').click();
  await page.getByLabel('Creator').fill('Anna');
  await page.getByRole('button', { name: 'Keep idea' }).click();
  await expect(
    page.getByText('Structure and surprise', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Anna/u)).toBeVisible();

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('wisdom-garden.png'),
  });
  await page.reload();
  await openExistingStudio(page, 'Inner Life Studio');
  await page.getByRole('link', { name: 'Wisdom Garden' }).click();
  await expect(
    page.getByText('Structure and surprise', { exact: true }),
  ).toBeVisible();
});
