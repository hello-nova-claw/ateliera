import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { enterCreatedStudio } from './helpers/studio';

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
  await page.getByRole('button', { name: 'Create a new Studio Space' }).click();
  await page.getByLabel('Studio name').fill('Search Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await enterCreatedStudio(page);
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

async function openPersistedStudio(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open Search Studio' }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
}

function note(input: {
  body: string;
  id: string;
  room: string;
  semanticType: 'reflection' | 'uncharted';
  title: string;
}): string {
  return `---
schema_version: 1
id: ${input.id}
title: ${JSON.stringify(input.title)}
card_type: text
semantic_type: ${input.semanticType}
status: active
rooms:
  - ${input.room}
life_areas:
  - home
seasons:
  - gentle-winter
tags:
  - calm
created: 2026-07-01T09:00:00.000Z
updated: 2026-07-14T09:00:00.000Z
attachments: []
display: { featured: false }
privacy: { sensitivity: private, ai_access: ask }
---
${input.body}
`;
}

async function putIndexedDbFiles(
  page: Page,
  files: Array<{ path: string; text: string }>,
): Promise<void> {
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

async function seedSearchFixture(page: Page): Promise<void> {
  await putIndexedDbFiles(page, [
    {
      path: 'Reflection Garden/quiet.md',
      text: note({
        id: 'quiet-reflection',
        title: 'A quiet morning that worked',
        semanticType: 'reflection',
        room: 'reflection-garden',
        body: 'Five calm minutes changed the afternoon.',
      }),
    },
    {
      path: 'Reflection Garden/supporting.md',
      text: note({
        id: 'supporting-reflection',
        title: 'A supporting reflection',
        semanticType: 'reflection',
        room: 'reflection-garden',
        body: 'A calm memory points to [[A quiet morning that worked]].',
      }),
    },
    {
      path: 'Uncharted/retreat.md',
      text: note({
        id: 'retreat-possibility',
        title: 'What if I created a retreat?',
        semanticType: 'uncharted',
        room: 'uncharted',
        body: 'A calm place beyond the gate.',
      }),
    },
    {
      path: 'Reflection Garden/literal-markup.md',
      text: note({
        id: 'literal-markup',
        title: 'Literal <script>window.__studioSearchInjected=true</script>',
        semanticType: 'reflection',
        room: 'reflection-garden',
        body: 'Markup stays literal: <img src=x onerror="window.__studioSearchInjected=true">.',
      }),
    },
  ]);
  await page.reload();
  await openPersistedStudio(page);
  await openSearch(page);
}

test('searches the production local index, persists filters, and renders imported markup as text', async ({
  page,
}, testInfo) => {
  await createLocalStudio(page);
  await seedSearchFixture(page);

  const search = page.getByRole('searchbox', { name: 'Search your Studio' });
  await search.fill('calm');
  await expect(page.getByRole('article', { name: 'A quiet morning that worked' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'What if I created a retreat?' })).toBeVisible();

  await page.getByRole('button', { name: 'Filters' }).click();
  const reflection = page.getByRole('checkbox', { name: /^Reflection \d+$/u });
  await reflection.check();
  await expect(page).toHaveURL(/(?:\?|&)q=calm(?:&|$)/u);
  await expect(page).toHaveURL(/(?:\?|&)type=reflection(?:&|$)/u);
  await expect(page.getByRole('article', { name: 'A quiet morning that worked' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'What if I created a retreat?' })).toHaveCount(0);

  await page.reload();
  await openPersistedStudio(page);
  await expect(search).toHaveValue('calm');
  await page.getByRole('button', { name: /Filters/u }).click();
  await expect(page.getByRole('checkbox', { name: /^Reflection \d+$/u })).toBeChecked();
  await expect(page.getByRole('article', { name: 'What if I created a retreat?' })).toHaveCount(0);

  await search.fill('Markup');
  const literal = page.getByRole('article', {
    name: 'Literal <script>window.__studioSearchInjected=true</script>',
  });
  await expect(literal).toContainText('<script>window.__studioSearchInjected=true</script>');
  await expect(literal.locator('script, img')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__studioSearchInjected'))).toBeUndefined();
  expect((await new AxeBuilder({ page }).include('.search-page').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    return [...document.querySelectorAll<HTMLElement>('body *')].flatMap((element) => {
      const bounds = element.getBoundingClientRect();
      if (bounds.left >= -1 && bounds.right <= viewport + 1) return [];
      return [{
        className: element.className,
        left: bounds.left,
        right: bounds.right,
        tag: element.tagName,
        text: element.textContent?.trim().slice(0, 120) ?? '',
      }];
    });
  })).toEqual([]);
  const screenshot = testInfo.outputPath('search-room.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('search-room', { path: screenshot, contentType: 'image/png' });
});

test('opens the Inspector with backlinks, traps focus, and restores the invoking result', async ({
  page,
}) => {
  await createLocalStudio(page);
  await seedSearchFixture(page);
  await page.getByRole('searchbox', { name: 'Search your Studio' }).fill('quiet');
  const result = page.getByRole('button', { name: 'A quiet morning that worked' });
  await result.click();

  const inspector = page.getByRole('dialog', { name: 'Inspect A quiet morning that worked' });
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText('Five calm minutes changed the afternoon.');
  await inspector.getByRole('button', { name: 'Show note details' }).click();
  await expect(inspector).toContainText('quiet-reflection');
  await inspector.getByRole('button', { name: 'Show links' }).click();
  const backlink = inspector.getByRole('button', { name: 'Open A supporting reflection' });
  await expect(backlink).toBeVisible();

  await inspector.getByRole('button', { name: 'Close inspector' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(inspector.locator(':focus')).toBeVisible();
  await backlink.click();
  await expect(page.getByRole('dialog', { name: 'Inspect A supporting reflection' })).toBeVisible();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(result).toBeFocused();
});

test('keeps warmed local search available after connectivity disappears', async ({
  context,
  page,
}) => {
  await createLocalStudio(page);
  await seedSearchFixture(page);
  const search = page.getByRole('searchbox', { name: 'Search your Studio' });
  await search.fill('calm');
  await expect(page.getByRole('article', { name: 'A quiet morning that worked' })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText('Stored locally · Search is still available offline.')).toBeVisible();
  await search.fill('retreat');
  await expect(page.getByRole('article', { name: 'What if I created a retreat?' })).toBeVisible();
});

test('opens an existing Studio and starts its search worker entirely from the offline precache', async ({
  browserName,
  context,
  page,
}, testInfo) => {
  test.skip(
    browserName === 'webkit',
    'WebKit exposes module-worker loading to context.route as XHR and Web Inspector blocks it before the service worker; Chromium proves the cold precache path.',
  );
  const browserErrors: string[] = [];
  const consoleMessages: string[] = [];
  const failedRequests: string[] = [];
  const routedRequests: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => failedRequests.push(
    `${request.resourceType()} ${request.url()} · ${request.failure()?.errorText ?? 'failed'}`,
  ));
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto('/');
  await page.evaluate(async (seededNote) => {
    const record = {
      name: 'Cold Search Studio',
      vaultId: 'studio:cold-search-studio',
      createdAt: '2026-07-14T09:00:00.000Z',
    };
    localStorage.setItem('studio:browser-studios', JSON.stringify([record]));
    localStorage.setItem('studio:active-browser-studio', record.vaultId);
    const request = indexedDB.open('ateliera-browser-vaults', 3);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains('files')) {
        const files = request.result.createObjectStore('files', { keyPath: 'key' });
        files.createIndex('vault', 'vault', { unique: false });
      }
      if (!request.result.objectStoreNames.contains('backends')) {
        request.result.createObjectStore('backends');
      }
    });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const bytes = new TextEncoder().encode(seededNote);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const write = database.transaction(['files', 'backends'], 'readwrite');
    write.objectStore('files').put({
      key: `${record.vaultId}\u0000Reflection Garden/offline.md`,
      vault: record.vaultId,
      path: 'Reflection Garden/offline.md',
      bytes: bytes.buffer,
      hash,
      modifiedAt: new Date().toISOString(),
    });
    write.objectStore('backends').put('indexeddb', record.vaultId);
    await new Promise<void>((resolve, reject) => {
      write.addEventListener('complete', () => resolve(), { once: true });
      write.addEventListener('error', () => reject(write.error), { once: true });
    });
    database.close();
  }, note({
    id: 'offline-search-note',
    title: 'A note waiting offline',
    semanticType: 'reflection',
    room: 'reflection-garden',
    body: 'A lantern is ready in the local archive.',
  }));
  await page.reload();
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/service-worker.js', {
      type: 'module',
      scope: '/',
    });
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller === null) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => resolve(),
        { once: true },
      ));
    }
  });
  const precache = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const manifest = (await (
      await fetch('/studio-precache-manifest.json')
    ).json()) as {
      version: string;
      entries: Array<{ url: string }>;
    };
    const cache = await caches.open(`studio-app-shell-${manifest.version}`);
    const required = manifest.entries
      .map(({ url }) => url)
      .filter((url) => url.endsWith('.wasm') || url.includes('worker'));
    const matches = await Promise.all(required.map((url) => cache.match(url)));
    return {
      missing: required.filter((_url, index) => matches[index] === undefined),
      required,
    };
  });
  expect(precache.required).toHaveLength(3);
  expect(precache.missing).toEqual([]);

  await context.route('**/*', (route) => {
    const request = route.request();
    routedRequests.push(`${request.resourceType()} ${request.url()}`);
    return request.resourceType() === 'document'
      ? route.continue()
      : route.abort('internetdisconnected');
  });
  if (browserName !== 'webkit') await context.setOffline(true);

  await page.getByRole('button', { name: 'Open Cold Search Studio' }).click();
  await openSearch(page);
  const search = page.getByRole('searchbox', { name: 'Search your Studio' });
  await search.fill('lantern');
  try {
    await expect(page.getByRole('article', { name: 'A note waiting offline' })).toBeVisible({
      timeout: 15_000,
    });
  } catch (error) {
    const runtime = await page.evaluate(async () => ({
      cacheNames: await caches.keys(),
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      status: document.querySelector('.search-page__error, .search-page__loading, .search-page__notice')
        ?.textContent?.trim() ?? null,
    }));
    const diagnostics = JSON.stringify({
      browserErrors,
      consoleMessages,
      failedRequests,
      routedRequests,
      runtime,
    }, null, 2);
    await testInfo.attach('cold-offline-diagnostics.json', {
      body: diagnostics,
      contentType: 'application/json',
    });
    throw new Error(
      `${error instanceof Error ? error.message : 'Cold offline search failed.'}\n${diagnostics}`,
      { cause: error },
    );
  }
  if (browserName !== 'webkit') {
    await expect(page.getByText('Stored locally · Search is still available offline.')).toBeVisible();
  }
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
