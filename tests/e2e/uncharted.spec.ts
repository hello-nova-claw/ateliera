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

async function beginSeason(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Current Season' }).click();
  await page.getByRole('button', { name: 'Begin a season' }).click();
  await page.getByLabel('Season name').fill('Making room');
  await page.getByLabel('Starts').fill('2026-07-14');
  await page.getByLabel('Ends').fill('2026-09-30');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Skip this reflection for now').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('This is a season of…').fill('making room');
  await page.getByLabel(/How should it feel/).fill('Calm');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('New Landscape priority').fill('Home');
  await page.getByRole('button', { name: 'Create Landscape priority' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Decisions and experiments — 30 days').fill('Keep it small');
  await page.getByLabel(/Practices/).fill('Return gently');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Support available').fill('Time');
  await page.getByLabel('Real constraints').fill('Energy');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('What will be enough?').fill('One useful connection.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel(/intentionally setting down/).fill('Urgency');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Begin this season' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Making room' })).toBeVisible();
}

async function replaceIndexedDbText(
  page: Page,
  pathPrefix: string,
  before: string,
  after: string,
): Promise<void> {
  await page.evaluate(async ({ pathPrefix, before, after }) => {
    const active = localStorage.getItem('studio:active-browser-studio');
    if (!active) throw new Error('No active Studio');
    const request = indexedDB.open('ateliera-browser-vaults', 3);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const readTransaction = database.transaction('files', 'readonly');
    const read = readTransaction.objectStore('files').index('vault').getAll(active);
    const records = await new Promise<Array<{
      key: string; vault: string; path: string; bytes: ArrayBuffer;
      hash: string; modifiedAt: string;
    }>>((resolve, reject) => {
      read.addEventListener('success', () => resolve(read.result), { once: true });
      read.addEventListener('error', () => reject(read.error), { once: true });
    });
    const record = records.find((item) => item.path.startsWith(pathPrefix));
    if (!record) throw new Error(`No note under ${pathPrefix}`);
    const text = new TextDecoder().decode(record.bytes);
    const bytes = new TextEncoder().encode(text.replace(before, after));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    record.bytes = bytes.buffer;
    record.hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    record.modifiedAt = new Date().toISOString();
    const write = database.transaction('files', 'readwrite');
    write.objectStore('files').put(record);
    await new Promise<void>((resolve, reject) => {
      write.addEventListener('complete', () => resolve(), { once: true });
      write.addEventListener('error', () => reject(write.error), { once: true });
    });
    database.close();
  }, { pathPrefix, before, after });
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
  await expect(page.getByText('Stored locally. This room remains available offline.')).toBeVisible();
  await page.getByLabel('What if…').fill('What if five quiet minutes were enough?');
  await page.getByRole('button', { name: 'Keep this possibility' }).click();
  await expect(page.getByRole('heading', { name: 'What if five quiet minutes were enough?' })).toBeVisible();
  const cards = await page.locator('.uncharted-card').all();
  const boxes = await Promise.all(cards.map((card) => card.boundingBox()));
  expect(boxes.every((box, index) => index === 0 || box!.y > boxes[index - 1]!.y)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('serializes a conflicted season invitation, refreshes, and retries the exact card', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop Chromium and WebKit prove exact retry focus.');
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: undefined,
    });
  });
  await createLocalStudio(page);
  await beginSeason(page);
  await openUncharted(page);
  await page.getByLabel('What if…').fill('A season-linked possibility');
  await page.getByRole('button', { name: 'Keep this possibility' }).click();
  const invite = page.getByRole('button', {
    name: 'Invite A season-linked possibility into Making room',
  });
  await expect(invite).toBeVisible();
  await replaceIndexedDbText(
    page,
    'Uncharted/',
    'A season-linked possibility',
    'A durable season possibility',
  );
  await invite.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByText(/changed elsewhere/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A durable season possibility' })).toBeVisible();
  const retry = page.getByRole('button', {
    name: 'Invite A durable season possibility into Making room',
  });
  await expect(retry).toBeFocused();
  await retry.click();
  await expect(page.getByText('Linked with Making room', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A durable season possibility' })).toBeVisible();
});
