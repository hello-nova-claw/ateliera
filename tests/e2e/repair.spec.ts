import { expect, test, type Page } from '@playwright/test';

interface VaultRecord {
  key: string;
  vault: string;
  path: string;
  bytes: ArrayBuffer;
  hash: string;
  modifiedAt: string;
}

async function createLocalStudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('Repair Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
}

async function openSearch(page: Page): Promise<void> {
  const link = page.getByRole('link', { name: 'Search' });
  if (await link.isVisible()) await link.click();
  else {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Search' }).click();
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
}

function validNote(input: { body: string; id: string; title: string }): string {
  return `---
schema_version: 1
id: ${input.id}
title: ${JSON.stringify(input.title)}
card_type: reflection
semantic_type: reflection
status: active
rooms:
  - reflection-garden
life_areas: []
seasons: []
tags: []
created: 2026-07-01T09:00:00.000Z
updated: 2026-07-14T09:00:00.000Z
attachments: []
display: { featured: false }
privacy: { sensitivity: private, ai_access: ask }
---
${input.body}
`;
}

async function openDatabase(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const request = indexedDB.open('ateliera-browser-vaults', 3);
    await new Promise<void>((resolve, reject) => {
      request.addEventListener('success', () => {
        request.result.close();
        resolve();
      }, { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
  });
}

async function putIndexedDbFiles(
  page: Page,
  files: Array<{ path: string; text: string }>,
): Promise<void> {
  await openDatabase(page);
  await page.evaluate(async (entries) => {
    const active = localStorage.getItem('studio:active-browser-studio');
    if (!active) throw new Error('No active Studio');
    const request = indexedDB.open('ateliera-browser-vaults', 3);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const records: VaultRecord[] = [];
    for (const entry of entries) {
      const bytes = new TextEncoder().encode(entry.text);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hash = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0')).join('');
      records.push({
        key: `${active}\u0000${entry.path}`,
        vault: active,
        path: entry.path,
        bytes: bytes.buffer,
        hash,
        modifiedAt: new Date().toISOString(),
      });
    }
    const write = database.transaction('files', 'readwrite');
    for (const record of records) write.objectStore('files').put(record);
    await new Promise<void>((resolve, reject) => {
      write.addEventListener('complete', () => resolve(), { once: true });
      write.addEventListener('error', () => reject(write.error), { once: true });
    });
    database.close();
  }, files);
}

async function readIndexedDbText(page: Page, path: string): Promise<string> {
  return page.evaluate(async (exactPath) => {
    const active = localStorage.getItem('studio:active-browser-studio');
    if (!active) throw new Error('No active Studio');
    const request = indexedDB.open('ateliera-browser-vaults', 3);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const read = database.transaction('files', 'readonly').objectStore('files')
      .get(`${active}\u0000${exactPath}`);
    const record = await new Promise<VaultRecord>((resolve, reject) => {
      read.addEventListener('success', () => resolve(read.result as VaultRecord), { once: true });
      read.addEventListener('error', () => reject(read.error), { once: true });
    });
    database.close();
    return new TextDecoder().decode(record.bytes);
  }, path);
}

async function seedRepairFixture(page: Page): Promise<void> {
  await putIndexedDbFiles(page, [
    {
      path: 'Reflection Garden/broken-metadata.md',
      text: '---\r\nid: broken-metadata\r\ntitle: Kept title\r\ncreated: yesterday\r\nupdated: tomorrow\r\nlegacy_key: kept\r\n---\r\nWords remain recoverable.\r\n',
    },
    {
      path: 'Reflection Garden/broken-links.md',
      text: validNote({
        id: 'broken-links',
        title: 'Links awaiting care',
        body: 'Keep the words around [[Missing place]] and [[Second missing]].',
      }),
    },
    {
      path: 'Reflection Garden/known.md',
      text: validNote({
        id: 'known-place',
        title: 'Known place',
        body: 'This destination is here.',
      }),
    },
  ]);
  await page.reload();
  await page.getByRole('button', { name: 'Open Repair Studio' }).click();
  await openSearch(page);
  await page.getByRole('button', { name: /Review \d+ repair items?/u }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Repair' })).toBeVisible();
}

async function mutateIndexedDbText(
  page: Page,
  path: string,
  transform: { after: string; before: string },
): Promise<void> {
  await page.evaluate(async ({ exactPath, replacement }) => {
    const active = localStorage.getItem('studio:active-browser-studio');
    if (!active) throw new Error('No active Studio');
    const request = indexedDB.open('ateliera-browser-vaults', 3);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const read = database.transaction('files', 'readonly').objectStore('files')
      .get(`${active}\u0000${exactPath}`);
    const record = await new Promise<VaultRecord>((resolve, reject) => {
      read.addEventListener('success', () => resolve(read.result as VaultRecord), { once: true });
      read.addEventListener('error', () => reject(read.error), { once: true });
    });
    const source = new TextDecoder().decode(record.bytes);
    if (!source.includes(replacement.before)) throw new Error('Expected source text is absent');
    const bytes = new TextEncoder().encode(
      source.replace(replacement.before, replacement.after),
    );
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
  }, { exactPath: path, replacement: transform });
}

test('repairs malformed metadata without changing the body or unknown safe keys', async ({
  page,
}, testInfo) => {
  await createLocalStudio(page);
  await seedRepairFixture(page);

  const repair = page.locator('.repair-card--metadata', {
    has: page.getByRole('heading', { name: 'Reflection Garden/broken-metadata.md' }),
  });
  await expect(repair.locator('.repair-card__errors li').first()).toBeVisible();
  await repair.getByText('Read the untouched body').click();
  await expect(repair).toContainText('Words remain recoverable.');
  await expect(repair.getByLabel('Title')).toHaveValue('Kept title');
  await expect(repair.getByLabel('Created')).toHaveValue('yesterday');
  await expect(repair.getByLabel('Updated')).toHaveValue('tomorrow');
  await repair.getByLabel('Created').scrollIntoViewIfNeeded();
  const screenshot = testInfo.outputPath('metadata-repair-timestamps.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('metadata-repair-timestamps', {
    path: screenshot,
    contentType: 'image/png',
  });
  await repair.getByLabel('Created').fill('2026-07-13T00:00:00.000Z');
  await repair.getByLabel('Updated').fill('2026-07-14T00:00:00.000Z');
  await repair.getByLabel('Stable note ID').fill('repaired-metadata');
  await repair.getByLabel('Card type').fill('reflection');
  await repair.getByRole('button', { name: 'Repair metadata' }).click();

  await expect.poll(() => readIndexedDbText(
    page,
    'Reflection Garden/broken-metadata.md',
  )).toContain('schema_version: 1');
  const durable = await readIndexedDbText(page, 'Reflection Garden/broken-metadata.md');
  expect(durable).toContain('legacy_key: kept');
  expect(durable).toContain('Words remain recoverable.\r\n');
});

test('relinks and removes exact broken-link occurrences while preserving surrounding words', async ({
  page,
}) => {
  await createLocalStudio(page);
  await seedRepairFixture(page);

  const missing = page.locator('.repair-card--link', {
    has: page.getByRole('heading', { name: 'Missing place' }),
  });
  await missing.getByLabel('New target').fill('Known place');
  await missing.getByRole('button', { name: 'Relink' }).click();
  await expect.poll(() => readIndexedDbText(
    page,
    'Reflection Garden/broken-links.md',
  )).toContain('[[Known place|Missing place]]');

  const second = page.locator('.repair-card--link', {
    has: page.getByRole('heading', { name: 'Second missing' }),
  });
  await second.getByRole('button', { name: 'Remove link' }).click();
  await expect.poll(() => readIndexedDbText(
    page,
    'Reflection Garden/broken-links.md',
  )).not.toContain('[[Second missing]]');
  expect(await readIndexedDbText(page, 'Reflection Garden/broken-links.md'))
    .toContain('Keep the words around [[Known place|Missing place]] and Second missing.');
});

test('rejects a stale repair with real IndexedDB compare-and-swap and preserves both versions', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop engines prove exact retry focus and CAS.');
  await createLocalStudio(page);
  await seedRepairFixture(page);

  const missing = page.locator('.repair-card--link', {
    has: page.getByRole('heading', { name: 'Missing place' }),
  });
  await mutateIndexedDbText(page, 'Reflection Garden/broken-links.md', {
    before: 'Keep the words around',
    after: 'External words survive beside',
  });
  const remove = missing.getByRole('button', { name: 'Remove link' });
  await remove.click();
  await expect(missing.getByRole('alert')).toHaveText(/changed elsewhere.*Both versions have been preserved/iu);
  await expect(remove).toBeFocused();
  const durable = await readIndexedDbText(page, 'Reflection Garden/broken-links.md');
  expect(durable).toContain('External words survive beside [[Missing place]]');
  expect(durable).toContain('[[Second missing]]');
  await expect(missing.getByRole('button', { name: 'Remove link' })).toBeVisible();
});
