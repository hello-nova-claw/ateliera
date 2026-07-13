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
}) => {
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
  await expect(page.getByRole('button', { name: 'Before the blur' })).toBeFocused();

  await openEditor(page, 'Before the blur');
  await expect(page.getByRole('textbox', { name: 'Markdown body' })).toContainText(
    'After the blur',
  );
});

test('keeps local and external versions when exact-hash save conflicts', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Direct OPFS mutation is a Chromium integration proof.');
  await createLocalStudio(page);
  await capture(page, 'Original words');
  await openEditor(page, 'Original words');

  await page.evaluate(async () => {
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
    await writable.write(text.replace('Original words', 'The other version'));
    await writable.close();
  });

  await page
    .getByRole('textbox', { name: 'Markdown body' })
    .fill('My local version');
  await expect(page.getByRole('alert')).toContainText('Another version exists');
  await expect(page.getByRole('region', { name: 'Your version' })).toContainText(
    'My local version',
  );
  await expect(page.getByRole('region', { name: 'Other version' })).toContainText(
    'The other version',
  );
  await expect(page.getByRole('button', { name: 'Keep mine as a sibling' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep other' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Merge manually' })).toBeVisible();
});
