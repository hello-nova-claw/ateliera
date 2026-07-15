import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function createLocalStudio(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a new Studio Space' }).click();
  await page.getByLabel('Studio name').fill('Season Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
}

async function openSeasonRoom(page: Page): Promise<void> {
  const seasonLink = page.getByRole('link', { name: 'Current Season' });
  if (await seasonLink.isVisible()) await seasonLink.click();
  else {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Current Season' }).click();
  }
}

async function beginSeason(page: Page): Promise<void> {
  await openSeasonRoom(page);
  await page.getByRole('button', { name: 'Begin a season' }).click();
  await page.getByLabel('Season name').fill('A spacious winter');
  await page.getByLabel('Starts').fill('2026-07-14');
  await page.getByLabel('Ends').fill('2026-09-30');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Skip this reflection for now').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('This is a season of…').fill('making room');
  await page.getByLabel(/How should it feel/).fill('Calm\nCurious');
  await page.getByRole('button', { name: 'Continue' }).click();
  for (const priority of ['Home', 'Studio', 'Family']) {
    await page.getByLabel('New Landscape priority').fill(priority);
    await page
      .getByRole('button', { name: 'Create Landscape priority' })
      .click();
    await expect(page.getByRole('checkbox', { name: priority })).toBeChecked();
  }
  await page.getByRole('button', { name: 'Continue' }).click();
  await page
    .getByLabel('Decisions and experiments — 30 days')
    .fill('Choose the smallest useful scope');
  await page.getByLabel(/Practices/).fill('Create before consuming');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Support available').fill('Childcare');
  await page.getByLabel('Real constraints').fill('Energy');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page
    .getByLabel('What will be enough?')
    .fill('A genuinely useful first version.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page
    .getByLabel(/intentionally setting down/)
    .fill('A perfect whole-house system');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Begin this season' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'A spacious winter' }),
  ).toBeVisible();
}

test('recovers an interrupted wizard after reload', async ({ page }) => {
  await createLocalStudio(page);
  await openSeasonRoom(page);
  await page.getByRole('button', { name: 'Begin a season' }).click();
  await page.getByLabel('Season name').fill('A spacious winter');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Step 2 of 9')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Open Season Studio' }).click();
  await openSeasonRoom(page);
  await expect(page.getByText('Step 2 of 9')).toBeVisible();
});

test('builds, reads, reloads, and closes a season without automatic carry-forward', async ({
  page,
}, testInfo) => {
  await createLocalStudio(page);
  await beginSeason(page);
  expect(
    (await new AxeBuilder({ page }).include('.season-page').analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('current-season.png'),
    fullPage: true,
  });

  await page.reload();
  await page.getByRole('button', { name: 'Open Season Studio' }).click();
  await openSeasonRoom(page);
  await expect(
    page.getByRole('heading', { name: 'A spacious winter' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close season' }).click();
  await page.getByRole('button', { name: 'Archive season and letter' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Add what you celebrate before closing this season.',
  );
  await expect(page.getByRole('alert')).toBeFocused();
  await page.getByLabel('What do you celebrate?').fill('We made room.');
  await page.getByLabel('What did you learn?').fill('Small was enough.');
  await page.getByLabel('Who did you become?').fill('More trusting.');
  for (const priority of ['Home', 'Studio', 'Family']) {
    await page
      .getByRole('combobox', { name: priority })
      .selectOption('return-landscape');
  }
  await page.getByRole('button', { name: 'Archive season and letter' }).click();
  await expect(
    page.getByRole('button', { name: 'Begin a season' }),
  ).toBeVisible();
});

test('stays a calm one-column flow on mobile', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-chromium',
    'Mobile-specific composition proof.',
  );
  await createLocalStudio(page);
  await beginSeason(page);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const cards = await page.getByRole('article', { name: /Priority/ }).all();
  const boxes = await Promise.all(cards.map((card) => card.boundingBox()));
  expect(
    boxes.every((box, index) => index === 0 || box!.y > boxes[index - 1]!.y),
  ).toBe(true);
});

test('restores the mobile More trigger after outside dismissal', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-chromium',
    'Mobile navigation focus proof.',
  );
  await createLocalStudio(page);
  const more = page.getByRole('button', { name: 'More' });
  await more.click();
  await expect(
    page.getByRole('menu', { name: 'More Studio rooms' }),
  ).toBeVisible();

  await page.locator('.studio-app-shell__topbar').click();

  await expect(
    page.getByRole('menu', { name: 'More Studio rooms' }),
  ).toBeHidden();
  await expect(more).toBeFocused();
});
