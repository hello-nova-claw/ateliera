import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function createLocalStudio(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('The Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
}

async function capture(page: Page, body: string): Promise<number> {
  const started = Date.now();
  await page.getByRole('button', { name: 'Capture' }).click();
  const input = page.getByRole('textbox', {
    name: 'What would you like remembered?',
  });
  await expect(input).toBeFocused();
  await input.fill(body);
  await page.getByRole('button', { name: 'Remember' }).click();
  await expect(page.locator('.studio-toast')).toHaveText('Remembered.');
  await expect(page.getByRole('button', { name: body })).toBeVisible();
  return Date.now() - started;
}

async function openEditor(page: Page, body: string): Promise<void> {
  await page.getByRole('button', { name: body }).click();
  await expect(page.getByRole('dialog', { name: 'Edit note' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Markdown body' })).toBeVisible();
}

async function replaceFirstOpfsCapture(
  page: Page,
  from: string,
  to: string,
): Promise<void> {
  await page.evaluate(
    async ({ from, to }) => {
      const active = localStorage.getItem('studio:active-browser-studio');
      if (active === null) throw new Error('No active Studio');
      const root = await navigator.storage.getDirectory();
      const studioRoot = await root.getDirectoryHandle('the-studio');
      const vault = await studioRoot.getDirectoryHandle(encodeURIComponent(active));
      const inbox = await vault.getDirectoryHandle('Inbox');
      let fileHandle: FileSystemFileHandle | undefined;
      for await (const [, handle] of inbox.entries()) {
        if (handle.kind === 'file') {
          fileHandle = handle as FileSystemFileHandle;
          break;
        }
      }
      if (fileHandle === undefined) throw new Error('No capture found');
      const text = await (await fileHandle.getFile()).text();
      const writable = await fileHandle.createWritable();
      await writable.write(text.replace(from, to));
      await writable.close();
    },
    { from, to },
  );
}

test('captures in under 15 seconds and lazily opens an accessible editor', async ({
  page,
}, testInfo) => {
  const scripts: string[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') scripts.push(response.url());
  });
  await createLocalStudio(page);
  expect(await capture(page, 'The childhood hill')).toBeLessThan(15_000);
  expect(scripts.some((url) => url.includes('NoteEditorSession'))).toBe(false);

  await openEditor(page, 'The childhood hill');
  await expect
    .poll(() => scripts.some((url) => url.includes('NoteEditorSession')))
    .toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('capture-editor.png'),
    fullPage: true,
  });
});

test('offers an interrupted draft after reload and saves only after restore', async ({
  page,
}, testInfo) => {
  await createLocalStudio(page);
  await capture(page, 'Durable beginning');
  await openEditor(page, 'Durable beginning');
  await page
    .getByRole('textbox', { name: 'Markdown body' })
    .fill('Words interrupted before autosave');
  await page.reload();
  await page.getByRole('button', { name: 'Open The Studio' }).click();
  await openEditor(page, 'Durable beginning');

  await expect(page.getByText('Unsaved words are waiting.')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('recovery-state.png'),
    fullPage: true,
  });
  await expect(page.getByRole('textbox', { name: 'Markdown body' })).toContainText(
    'Durable beginning',
  );
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown body' })).toContainText(
    'Words interrupted before autosave',
  );
  await expect(page.locator('.card-editor__save-state')).toHaveText('Saved');
});

test('flushes the latest words on blur and Escape, then restores focus', async ({ page }) => {
  await createLocalStudio(page);
  await capture(page, 'Before the blur');
  await openEditor(page, 'Before the blur');
  await page
    .getByRole('textbox', { name: 'Markdown body' })
    .fill('After the blur');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Edit note' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'After the blur' })).toBeFocused();

  await openEditor(page, 'After the blur');
  await expect(page.getByRole('textbox', { name: 'Markdown body' })).toContainText(
    'After the blur',
  );
});

test('flushes an edit made inside the debounce window before history navigation', async ({
  page,
}) => {
  await createLocalStudio(page);
  await capture(page, 'Before history navigation');
  await page.evaluate(() => {
    history.pushState(null, '', '/landscape');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/landscape$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/foyer$/);
  await openEditor(page, 'Before history navigation');
  await page
    .getByRole('textbox', { name: 'Markdown body' })
    .fill('Saved before history navigation');

  await page.goForward();

  await expect(page).toHaveURL(/\/landscape$/);
  await expect(page.getByRole('dialog', { name: 'Edit note' })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/foyer$/);
  await openEditor(page, 'Saved before history navigation');
  await expect(page.getByRole('textbox', { name: 'Markdown body' })).toContainText(
    'Saved before history navigation',
  );
});

test('keeps local and external versions when exact-hash save conflicts', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(browserName !== 'chromium', 'Direct OPFS mutation is a Chromium integration proof.');
  await createLocalStudio(page);
  await capture(page, 'Original words');
  await openEditor(page, 'Original words');

  await replaceFirstOpfsCapture(page, 'Original words', 'The other version');

  await page
    .getByRole('textbox', { name: 'Markdown body' })
    .fill('My local version');
  await expect(page.getByRole('alert')).toContainText('Another version exists');
  await expect(page.getByRole('alert')).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('conflict-state.png'),
    fullPage: true,
  });
  await expect(page.getByRole('region', { name: 'Your version' })).toContainText(
    'My local version',
  );
  await expect(page.getByRole('region', { name: 'Other version' })).toContainText(
    'The other version',
  );
  await expect(page.getByRole('textbox', { name: 'Markdown body' })).toHaveAttribute(
    'contenteditable',
    'false',
  );
  await expect(page.getByRole('button', { name: 'Keep mine as a sibling' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep other' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Merge manually' })).toBeVisible();

  await page.getByRole('button', { name: 'Keep mine as a sibling' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit note' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'My local version' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'The other version' })).toBeVisible();
});

test('manually merges both versions and immediately saves through the browser vault', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Direct OPFS mutation is a Chromium integration proof.');
  await createLocalStudio(page);
  await capture(page, 'Manual original');
  await openEditor(page, 'Manual original');
  await replaceFirstOpfsCapture(page, 'Manual original', 'Manual remote version');

  await page
    .getByRole('textbox', { name: 'Markdown body' })
    .fill('Manual local version');
  await expect(page.getByRole('alert')).toBeFocused();
  await page.getByRole('button', { name: 'Merge manually' }).click();
  await expect(page.locator('.card-editor__save-state')).toHaveText('Unsaved changes');
  await page.getByRole('button', { name: 'Close editor' }).click();

  await expect(page.getByRole('dialog', { name: 'Edit note' })).toHaveCount(0);
  await page
    .getByRole('button', { name: /Manual local version.*Manual remote version/ })
    .click();
  await expect(page.getByRole('dialog', { name: 'Edit note' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Markdown body' })).toContainText(
    'Manual local version',
  );
  await expect(page.getByRole('textbox', { name: 'Markdown body' })).toContainText(
    'Manual remote version',
  );
});

test('keeps the durable IndexedDB version across browsers when choosing Keep other', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: undefined,
    });
  });
  await createLocalStudio(page);
  await capture(page, 'IndexedDB original');
  await openEditor(page, 'IndexedDB original');

  await page.evaluate(async () => {
    const active = localStorage.getItem('studio:active-browser-studio');
    if (active === null) throw new Error('No active Studio');
    const request = indexedDB.open('the-studio-browser-vaults', 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const readTransaction = database.transaction('files', 'readonly');
    const read = readTransaction.objectStore('files').index('vault').getAll(active);
    const records = await new Promise<Array<{
      key: string;
      vault: string;
      path: string;
      bytes: ArrayBuffer;
      hash: string;
      modifiedAt: string;
    }>>((resolve, reject) => {
      read.addEventListener('success', () => resolve(read.result), { once: true });
      read.addEventListener('error', () => reject(read.error), { once: true });
    });
    const record = records.find((item) => item.path.startsWith('Inbox/'));
    if (record === undefined) throw new Error('No IndexedDB capture found');
    const text = new TextDecoder().decode(record.bytes);
    const bytes = new TextEncoder().encode(
      text.replace('IndexedDB original', 'IndexedDB durable version'),
    );
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    record.bytes = bytes.buffer;
    record.hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    record.modifiedAt = new Date().toISOString();
    const writeTransaction = database.transaction('files', 'readwrite');
    writeTransaction.objectStore('files').put(record);
    await new Promise<void>((resolve, reject) => {
      writeTransaction.addEventListener('complete', () => resolve(), { once: true });
      writeTransaction.addEventListener('error', () => reject(writeTransaction.error), {
        once: true,
      });
    });
    database.close();
  });

  await page
    .getByRole('textbox', { name: 'Markdown body' })
    .fill('IndexedDB local version');
  await expect(page.getByRole('alert')).toContainText('Another version exists');
  await expect(page.getByRole('alert')).toBeFocused();
  await page.getByRole('button', { name: 'Keep other' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit note' })).toHaveCount(0);

  const durableText = await page.evaluate(async () => {
    const active = localStorage.getItem('studio:active-browser-studio');
    if (active === null) throw new Error('No active Studio');
    const request = indexedDB.open('the-studio-browser-vaults', 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const transaction = database.transaction('files', 'readonly');
    const read = transaction.objectStore('files').index('vault').getAll(active);
    const records = await new Promise<Array<{ path: string; bytes: ArrayBuffer }>>(
      (resolve, reject) => {
        read.addEventListener('success', () => resolve(read.result), { once: true });
        read.addEventListener('error', () => reject(read.error), { once: true });
      },
    );
    database.close();
    const record = records.find((item) => item.path.startsWith('Inbox/'));
    return record === undefined ? '' : new TextDecoder().decode(record.bytes);
  });
  expect(durableText).toContain('IndexedDB durable version');
  expect(durableText).not.toContain('IndexedDB local version');
});
