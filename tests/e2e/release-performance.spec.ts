import { expect, test, type Page } from '@playwright/test';
import {
  enterCreatedStudio,
  openExistingStudio,
  showEveryRoom,
} from './helpers/studio';

test.describe.configure({ mode: 'serial' });

async function createStudio(page: Page, name: string): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a new Studio Space' }).click();
  await page.getByLabel('Studio name').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await enterCreatedStudio(page);
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
  await showEveryRoom(page);
}

async function openRoom(page: Page, name: string): Promise<void> {
  const link = page.getByRole('link', { name });
  if (await link.isVisible()) await link.click();
  else {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name }).click();
  }
}

async function beginMinimalSeason(page: Page): Promise<void> {
  await openRoom(page, 'Current Season');
  await page.getByRole('button', { name: 'Begin a season' }).click();
  await page.getByLabel('Season name').fill('A gentle winter');
  await page.getByLabel('Starts').fill('2026-07-14');
  await page.getByLabel('Ends').fill('2026-09-30');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Skip this reflection for now').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('This is a season of…').fill('making room');
  await page.getByLabel(/How should it feel/u).fill('Calm');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('New Landscape priority').fill('Home');
  await page.getByRole('button', { name: 'Create Landscape priority' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page
    .getByLabel('Decisions and experiments — 30 days')
    .fill('Choose the smallest useful scope');
  await page.getByLabel(/Practices/u).fill('Return gently');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Support available').fill('Time');
  await page.getByLabel('Real constraints').fill('Variable energy');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('What will be enough?').fill('One calm room.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel(/intentionally setting down/u).fill('Urgency');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Begin this season' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'A gentle winter' }),
  ).toBeVisible();
}

test('meets warm local interaction budgets on the reference browser', async ({
  browserName,
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'Reference performance budgets run once in desktop Chromium.',
  );
  await createStudio(page, 'Performance Studio');

  const session =
    browserName === 'chromium' ? await context.newCDPSession(page) : undefined;
  await session?.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.reload();
  const shellStart = performance.now();
  await page.getByRole('button', { name: 'Open Performance Studio' }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
  const warmShellMs = performance.now() - shellStart;
  expect(warmShellMs).toBeLessThan(1_500);
  await session?.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  await openRoom(page, 'Life Landscape');
  await expect(
    page.getByRole('region', { name: 'Life Landscape matrix' }),
  ).toBeVisible();
  await openRoom(page, 'Foyer');
  const roomStart = performance.now();
  await openRoom(page, 'Life Landscape');
  await expect(
    page.getByRole('region', { name: 'Life Landscape matrix' }),
  ).toBeVisible();
  const roomTransitionMs = performance.now() - roomStart;
  expect(roomTransitionMs).toBeLessThan(150);

  await page.getByRole('button', { name: 'Open Home' }).click();
  await page
    .getByRole('region', { name: 'Vision' })
    .getByRole('button', { name: '+ Add' })
    .click();
  await page
    .getByRole('textbox', { name: 'What would an ordinary Tuesday look like if this were true?' })
    .fill('A calm home');
  const saveStart = performance.now();
  await page.getByRole('button', { name: 'Remember' }).click();
  const card = page.getByRole('button', { name: 'A calm home', exact: true });
  await expect(card).toBeVisible();
  const durableSaveMs = performance.now() - saveStart;
  expect(durableSaveMs).toBeLessThan(1_000);

  await card.click();
  await expect(
    page.getByRole('textbox', { name: 'Title' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close editor' }).click();
  const noteStart = performance.now();
  await card.click();
  await expect(
    page.getByRole('textbox', { name: 'Title' }),
  ).toBeVisible();
  const noteOpenMs = performance.now() - noteStart;
  expect(noteOpenMs).toBeLessThan(100);
  await page.getByRole('button', { name: 'Close editor' }).click();

  await openRoom(page, 'Search');
  const search = page.getByRole('searchbox', { name: 'Search your Studio' });
  await search.fill('warmup');
  await search.fill('');
  const searchStart = performance.now();
  await search.fill('calm home');
  await expect(
    page.getByRole('article').filter({ hasText: 'A calm home' }),
  ).toBeVisible();
  const searchMs = performance.now() - searchStart;
  expect(searchMs).toBeLessThan(200);

  await testInfo.attach('release-performance-budgets', {
    body: Buffer.from(
      `${JSON.stringify(
        { durableSaveMs, noteOpenMs, roomTransitionMs, searchMs, warmShellMs },
        null,
        2,
      )}\n`,
    ),
    contentType: 'application/json',
  });
});

test('canonical rooms survive destruction of the disposable in-memory index', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'The canonical rebuild story runs once; storage contracts cover other engines.',
  );
  await createStudio(page, 'Release Story Studio');
  await openRoom(page, 'Life Landscape');
  await page.getByRole('button', { name: 'Open Home' }).click();
  await page
    .getByRole('region', { name: 'Vision' })
    .getByRole('button', { name: '+ Add' })
    .click();
  await page
    .getByRole('textbox', { name: 'What would an ordinary Tuesday look like if this were true?' })
    .fill('A calm home');
  await page.getByRole('button', { name: 'Remember' }).click();
  await expect(
    page.getByRole('button', { name: 'A calm home', exact: true }),
  ).toBeVisible();

  await beginMinimalSeason(page);
  await openRoom(page, 'Reflection Garden');
  await page.getByLabel('Entry meaning').selectOption('celebration');
  await page.getByLabel('A sentence to keep').fill('The small rhythm held.');
  await page.getByRole('button', { name: 'Keep celebration' }).click();
  await expect(
    page.getByRole('heading', { name: 'The small rhythm held.' }),
  ).toBeVisible();

  // The SQLite-WASM index lives only in this document's worker. Reloading
  // destroys it; reopening must rebuild every view from canonical vault files.
  await page.reload();
  await openExistingStudio(page, 'Release Story Studio');

  await openRoom(page, 'Life Landscape');
  await page.getByRole('button', { name: 'Open Home' }).click();
  await expect(
    page.getByRole('button', { name: 'A calm home', exact: true }),
  ).toBeVisible();
  await openRoom(page, 'Current Season');
  await expect(
    page.getByRole('heading', { level: 1, name: 'A gentle winter' }),
  ).toBeVisible();
  await openRoom(page, 'Reflection Garden');
  await expect(
    page.getByRole('heading', { name: 'The small rhythm held.' }),
  ).toBeVisible();
  await openRoom(page, 'Search');
  await page
    .getByRole('searchbox', { name: 'Search your Studio' })
    .fill('calm home');
  await expect(
    page.getByRole('article').filter({ hasText: 'A calm home' }),
  ).toBeVisible();

  const screenshot = testInfo.outputPath('release-story-restored.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('release-story-restored', {
    contentType: 'image/png',
    path: screenshot,
  });
});
