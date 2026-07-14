import AxeBuilder from '@axe-core/playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function useIndexedDbVault(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: undefined,
    });
  });
}

async function createStudio(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
}

async function capture(page: Page, body: string): Promise<void> {
  const before = (await activeVaultRecords(page)).filter(({ path }) =>
    path.startsWith('Inbox/'),
  ).length;
  await page.getByRole('button', { name: 'Capture' }).click();
  await page.getByRole('textbox', {
    name: 'What would you like remembered?',
  }).fill(body);
  await page.getByRole('button', { name: 'Remember' }).click();
  await expect(page.locator('.studio-toast')).toHaveText('Remembered.');
  await expect
    .poll(async () =>
      (await activeVaultRecords(page)).filter(({ path }) =>
        path.startsWith('Inbox/'),
      ).length,
    )
    .toBe(before + 1);
}

async function openSettings(page: Page): Promise<void> {
  const link = page.getByRole('link', { name: 'Settings' });
  if (await link.isVisible()) await link.click();
  else {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Backup & restore' })).toBeVisible();
}

async function openSearch(page: Page): Promise<void> {
  const link = page.getByRole('link', { name: 'Search' });
  if (await link.isVisible()) await link.click();
  else {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Search' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
}

async function resetStudioSelection(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('button', { name: 'Create a Studio' })).toBeVisible();
}

interface ActiveVaultRecord {
  hash: string;
  path: string;
  text: string;
}

async function activeVaultRecords(page: Page): Promise<ActiveVaultRecord[]> {
  return page.evaluate(async () => {
    const active = localStorage.getItem('studio:active-browser-studio');
    if (active === null) throw new Error('No active Studio');
    const request = indexedDB.open('the-studio-browser-vaults', 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const transaction = database.transaction('files', 'readonly');
    const records = await new Promise<
      Array<{ vault: string; path: string; hash: string; bytes: ArrayBuffer }>
    >(
      (resolve, reject) => {
        const all = transaction.objectStore('files').getAll();
        all.addEventListener('success', () => resolve(all.result), { once: true });
        all.addEventListener('error', () => reject(all.error), { once: true });
      },
    );
    database.close();
    return records
      .filter((record) => record.vault === active)
      .map(({ path, hash, bytes }) => ({
        path,
        hash,
        text: new TextDecoder().decode(bytes),
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
  });
}

async function putActiveVaultText(
  page: Page,
  path: string,
  text: string,
): Promise<void> {
  await page.evaluate(async ({ targetPath, targetText }) => {
    const active = localStorage.getItem('studio:active-browser-studio');
    if (active === null) throw new Error('No active Studio');
    const request = indexedDB.open('the-studio-browser-vaults', 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const bytes = new TextEncoder().encode(targetText);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    const transaction = database.transaction('files', 'readwrite');
    transaction.objectStore('files').put({
      key: `${active}\u0000${targetPath}`,
      vault: active,
      path: targetPath,
      bytes: bytes.buffer,
      hash,
      modifiedAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    });
    database.close();
  }, { targetPath: path, targetText: text });
}

test('exports, destroys the active selection, and cleanly restores a portable Studio', async ({
  page,
}, testInfo) => {
  await useIndexedDbVault(page);
  await createStudio(page, 'Portable Source');
  await capture(page, 'The childhood hill is still here');
  await capture(page, 'Five quiet minutes still count');
  const sourceNotes = (await activeVaultRecords(page)).filter(({ path }) =>
    path.startsWith('Inbox/'),
  );
  expect(sourceNotes).toHaveLength(2);
  await openSettings(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download portable backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^the-studio-backup-.*\.zip$/u);
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();
  await expect(page.getByText('Your portable backup is ready', { exact: false })).toBeVisible();

  await resetStudioSelection(page);
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('Portable Restore');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
  await openSettings(page);
  await page.getByLabel('Choose a Studio backup').setInputFiles(backupPath!);

  expect(await page.getByRole('heading', { name: 'Review this restore' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Restore summary' })).toContainText('2 to create');
  await expect(page.getByRole('button', { name: 'Restore this backup' })).toBeDisabled();
  await page.getByRole('checkbox', {
    name: 'I understand that 0 existing files will be overwritten',
  }).check();
  await page.getByRole('button', { name: 'Restore this backup' }).click();
  await expect(page.getByText('Restore complete', { exact: false })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Open Portable Restore' }).click();
  await openSearch(page);
  await page.getByRole('searchbox', { name: 'Search your Studio' }).fill('childhood hill');
  await expect(page.getByRole('article', { name: 'Untitled note' })).toContainText(
    'The childhood hill is still here',
  );
  await page.getByRole('searchbox', { name: 'Search your Studio' }).fill('quiet minutes');
  await expect(page.getByRole('article', { name: 'Untitled note' })).toContainText(
    'Five quiet minutes still count',
  );
  const restoredNotes = (await activeVaultRecords(page)).filter(({ path }) =>
    path.startsWith('Inbox/'),
  );
  expect(restoredNotes).toEqual(sourceNotes);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('restored-studio.png'),
    fullPage: true,
  });
});

test('rejects a damaged backup before changing a single target file', async ({
  page,
}, testInfo) => {
  await useIndexedDbVault(page);
  await createStudio(page, 'Checksum Source');
  await capture(page, 'The words inside the safe backup');
  await openSettings(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download portable backup' }).click();
  const original = await (await downloadPromise).path();
  expect(original).not.toBeNull();
  const damaged = await readFile(original!);
  damaged[0] = 0;
  const damagedPath = testInfo.outputPath('damaged-studio.zip');
  await writeFile(damagedPath, damaged);

  await resetStudioSelection(page);
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('Checksum Target');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
  await capture(page, 'This target note must survive the damaged archive');
  await openSettings(page);
  const before = await activeVaultRecords(page);
  await page.getByLabel('Choose a Studio backup').setInputFiles(damagedPath);

  await expect(page.getByRole('alert')).toContainText(/invalid|checksum|ZIP/u);
  await expect(page.getByRole('heading', { name: 'Review this restore' })).toHaveCount(0);
  expect(await activeVaultRecords(page)).toEqual(before);
});

test('previews a collision, cancels without mutation, and restores only after explicit resolution', async ({
  page,
}) => {
  await useIndexedDbVault(page);
  await createStudio(page, 'Conflict Source');
  await capture(page, 'A possibility with a canonical identity');
  const [sourceNote] = (await activeVaultRecords(page)).filter(({ path }) =>
    path.startsWith('Inbox/'),
  );
  expect(sourceNote).toBeDefined();
  await openSettings(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download portable backup' }).click();
  const backupPath = await (await downloadPromise).path();
  expect(backupPath).not.toBeNull();

  await resetStudioSelection(page);
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('Conflict Target');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
  const conflictingText = sourceNote!.text.replace(
    /^id:\s*[^\n]+$/mu,
    'id: a-different-canonical-note',
  );
  expect(conflictingText).not.toBe(sourceNote!.text);
  await putActiveVaultText(page, sourceNote!.path, conflictingText);
  await openSettings(page);
  const input = page.getByLabel('Choose a Studio backup');
  await input.setInputFiles(backupPath!);

  await expect(page.getByRole('heading', { name: 'Review this restore' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Restore summary' })).toContainText('1 conflict');
  await expect(page.getByRole('button', { name: 'Restore this backup' })).toBeDisabled();
  const beforeCancel = await activeVaultRecords(page);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Restore cancelled. Nothing was changed.')).toBeVisible();
  expect(await activeVaultRecords(page)).toEqual(beforeCancel);

  await input.setInputFiles([]);
  await input.setInputFiles(backupPath!);
  await page.getByRole('radio', {
    name: `Use the file from this backup for ${sourceNote!.path}`,
  }).check();
  await page.getByRole('checkbox', {
    name: /I understand that \d+ existing files? will be overwritten/u,
  }).check();
  await page.getByRole('button', { name: 'Restore this backup' }).click();
  await expect(page.getByText('Restore complete', { exact: false })).toBeVisible();
  const recovered = (await activeVaultRecords(page)).find(
    ({ path }) => path === sourceNote!.path,
  );
  expect(recovered).toEqual(sourceNote);
});
