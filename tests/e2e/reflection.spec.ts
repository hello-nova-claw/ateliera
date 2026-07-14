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

async function openUncharted(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Uncharted' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'What if…?' })).toBeVisible();
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
    const request = indexedDB.open('the-studio-browser-vaults', 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const transaction = database.transaction('files', 'readonly');
    const query = transaction.objectStore('files').index('vault').getAll(active);
    const records = await new Promise<Array<{
      key: string; vault: string; path: string; bytes: ArrayBuffer;
      hash: string; modifiedAt: string;
    }>>((resolve, reject) => {
      query.addEventListener('success', () => resolve(query.result), { once: true });
      query.addEventListener('error', () => reject(query.error), { once: true });
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

async function enrichReflectionFixture(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const active = localStorage.getItem('studio:active-browser-studio');
    if (!active) throw new Error('No active Studio');
    const request = indexedDB.open('the-studio-browser-vaults', 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    type RecordValue = {
      key: string; vault: string; path: string; bytes: ArrayBuffer;
      hash: string; modifiedAt: string;
    };
    const readTransaction = database.transaction('files', 'readonly');
    const query = readTransaction.objectStore('files').index('vault').getAll(active);
    const records = await new Promise<RecordValue[]>((resolve, reject) => {
      query.addEventListener('success', () => resolve(query.result), { once: true });
      query.addEventListener('error', () => reject(query.error), { once: true });
    });
    const decoder = new TextDecoder();
    const now = records.find((item) =>
      decoder.decode(item.bytes).includes('I noticed that five quiet minutes changed the afternoon.'),
    );
    const then = records.find((item) =>
      decoder.decode(item.bytes).includes('The small morning practice held.'),
    );
    if (!now || !then) throw new Error('Reflection fixture notes are missing');
    const thenId = /^id:\s*(.+)$/mu.exec(decoder.decode(then.bytes))?.[1]?.trim();
    if (!thenId) throw new Error('The earlier reflection has no canonical ID');
    const encoder = new TextEncoder();
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII='),
      (value) => value.charCodeAt(0),
    );
    const hash = async (bytes: Uint8Array) => {
      const exact = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const digest = await crypto.subtle.digest('SHA-256', exact);
      return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    };
    const put = async (path: string, bytes: Uint8Array, existing?: RecordValue) => ({
      key: existing?.key ?? `${active}\u0000${path}`,
      vault: active,
      path,
      bytes: bytes.buffer,
      hash: await hash(bytes),
      modifiedAt: new Date().toISOString(),
    });
    const nowText = decoder.decode(now.bytes)
      .replace('life_areas: []', 'life_areas:\n  - missing-life-area')
      .replace(
        'seasons: []',
        'seasons:\n  - missing-season\n  - historical-season',
      )
      .replace('tags: []', 'tags:\n  - calm')
      .replace(
        'schema_version: 1',
        `then_note_id: ${thenId}\nrelated_notes:\n  - missing-target\n  - archived-target\nschema_version: 1`,
      )
      .replace(
        /display:\s*\n\s+featured: (?:true|false)\s*\nprivacy:/u,
        'display:\n  cover: ../../Attachments/garden.png\n  featured: true\nprivacy:',
      );
    const thenText = decoder.decode(then.bytes).replace(
      /display:\s*\n\s+featured: (?:true|false)\s*\nprivacy:/u,
      'display:\n  cover: ../../Attachments/missing.png\n  featured: true\nprivacy:',
    );
    if (!nowText.includes('cover: ../../Attachments/garden.png')) {
      throw new Error(`Could not add the available cover to ${now.path}`);
    }
    if (!thenText.includes('cover: ../../Attachments/missing.png')) {
      throw new Error(`Could not add the missing cover to ${then.path}`);
    }
    const archived = encoder.encode(`---
schema_version: 1
id: archived-target
title: A resting identity
card_type: identity
semantic_type: foundations
status: archived
rooms:
  - identity-studio
life_areas: []
seasons: []
tags: []
created: 2025-07-14T09:00:00.000Z
updated: 2025-07-14T09:00:00.000Z
attachments: []
display: { featured: false }
privacy: { sensitivity: private, ai_access: ask }
---
A resting identity.
`);
    const historicalSeason = encoder.encode(`---
schema_version: 1
id: historical-season-note
title: A Historical Season
card_type: season
semantic_type: foundations
status: archived
rooms:
  - current-season
life_areas: []
seasons: []
tags: []
created: 2025-01-01T09:00:00.000Z
updated: 2025-03-31T09:00:00.000Z
attachments: []
display: { featured: false }
privacy: { sensitivity: private, ai_access: ask }
season_id: historical-season
---
A season that has ended.
`);
    const malformed = encoder.encode('---\nid: broken\n---\nWords remain recoverable.\n');
    const values = await Promise.all([
      put(now.path, encoder.encode(nowText), now),
      put(then.path, encoder.encode(thenText), then),
      put('Identity Studio/resting.md', archived),
      put('Current Season/historical.md', historicalSeason),
      put('Reflection Garden/broken.md', malformed),
      put('Attachments/garden.png', png),
    ]);
    const write = database.transaction('files', 'readwrite');
    for (const value of values) write.objectStore('files').put(value);
    await new Promise<void>((resolve, reject) => {
      write.addEventListener('complete', () => resolve(), { once: true });
      write.addEventListener('error', () => reject(write.error), { once: true });
    });
    database.close();
  });
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

test('supports keyboard switching, offline capture, and one-column mobile reading', async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile-specific composition proof.');
  await createLocalStudio(page);
  await openReflection(page);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText('Stored locally. The garden remains available offline.')).toBeVisible();
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

test('serializes conflicted evidence, retries, and opens the canonical target', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop Chromium and WebKit prove retry focus and navigation.');
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: undefined,
    });
  });
  await createLocalStudio(page);
  await openUncharted(page);
  await page.getByLabel('What if…').fill('Evidence target');
  await page.getByRole('button', { name: 'Keep this possibility' }).click();
  await openReflection(page);
  await page.getByLabel('A sentence to keep').fill('Reflection with evidence');
  await page.getByRole('button', { name: 'Keep reflection' }).click();
  await expect(page.getByRole('heading', { name: 'Reflection with evidence' })).toBeVisible();
  const select = page.getByLabel('Connect evidence');
  await select.selectOption({ label: 'Evidence target' });
  const connect = page.getByRole('button', { name: 'Connect' });
  await replaceIndexedDbText(
    page,
    'Reflection Garden/Reflections/',
    'Reflection with evidence',
    'Durable reflection with evidence',
  );
  await connect.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByText(/changed elsewhere/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Durable reflection with evidence' })).toBeVisible();
  await expect(select).toHaveValue(/note:/);
  await expect(connect).toBeFocused();
  await connect.click();
  const evidence = page.getByRole('button', { name: /Open Evidence target,/ });
  await expect(evidence).toBeVisible();
  await evidence.click();
  await expect(page.getByRole('dialog', { name: 'Edit note' })).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('Evidence target');
  await page.getByRole('button', { name: 'Close editor' }).click();
  await expect(evidence).toBeFocused();
});

test('renders themes, then and now, real media, and calm repair states from canonical files', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop canonical-file integration proof.');
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: undefined,
    });
  });
  await createLocalStudio(page);
  await openReflection(page);
  const sentence = page.getByLabel('A sentence to keep');
  await sentence.fill('I noticed that five quiet minutes changed the afternoon.');
  await page.getByRole('button', { name: 'Keep reflection' }).click();
  await expect(page.getByRole('heading', {
    name: 'I noticed that five quiet minutes changed the afternoon.',
  })).toBeVisible();
  await page.getByLabel('Entry meaning').selectOption('celebration');
  await sentence.fill('The small morning practice held.');
  await page.getByRole('button', { name: 'Keep celebration' }).click();
  await expect(page.getByRole('heading', { name: 'The small morning practice held.' })).toBeVisible();
  await enrichReflectionFixture(page);
  await page.reload();
  await page.getByRole('button', { name: 'Open Reflection Studio' }).click();
  await openReflection(page);

  await expect(page.getByRole('alert')).toContainText('words remain untouched');
  await expect(page.getByRole('region', { name: 'Then and now' })).toContainText(
    'The small morning practice held.',
  );
  const image = page.getByRole('img', {
    name: 'I noticed that five quiet minutes changed the afternoon.',
  });
  await expect(image).toHaveAttribute('src', /^blob:/u);
  await expect(page.getByText('This image is not available here. The entry remains intact.')).toBeVisible();
  await expect(page.getByText('The connected note missing-target is not available here.')).toBeVisible();
  await expect(page.getByText('The connected note archived-target is archived.')).toBeVisible();
  await expect(page.getByText(
    'The connected life area missing-life-area is not available here.',
  )).toBeVisible();
  await expect(page.getByText(
    'The connected season missing-season is not available here.',
  )).toBeVisible();
  await expect(page.getByText(
    'The connected season A Historical Season is historical.',
  )).toBeVisible();
  await expect(page.getByRole('button', {
    name: /Open.*(?:missing-life-area|missing-season|historical-season)/,
  })).toHaveCount(0);
  await expect(page).toHaveURL(/\/reflection$/u);

  await page.getByRole('tab', { name: 'Themes' }).click();
  await page.getByRole('button', { name: 'calm, 1 entry' }).click();
  await expect(page.getByRole('heading', {
    name: 'I noticed that five quiet minutes changed the afternoon.',
  })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The small morning practice held.' })).toBeHidden();
});
