import { expect, test, type Page } from '@playwright/test';
import { enterCreatedStudio, openExistingStudio } from './helpers/studio';

test.describe.configure({ mode: 'serial' });

async function createLocalStudio(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Create a new Studio Space' }).click();
  await page.getByLabel('Studio name').fill('Ateliera');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await enterCreatedStudio(page);
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
}

test('captured note survives reload while offline', async ({
  page,
  context,
  browserName,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    const text = message.text();
    // Chromium reports cache-first requests as disconnected while Playwright
    // emulates network loss, even when the service worker returns the cached
    // response. Preserve all application errors and ignore only that browser
    // transport diagnostic.
    if (
      message.type() === 'error' &&
      !text.includes('net::ERR_INTERNET_DISCONNECTED')
    )
      browserErrors.push(text);
  });
  await page.goto('/');
  await createLocalStudio(page);
  await page.getByRole('button', { name: 'Capture' }).click();
  await page
    .getByRole('textbox', { name: 'What would you like remembered?' })
    .fill('The hill');
  await page.getByRole('button', { name: 'Remember' }).click();
  await expect(page.getByText('The hill')).toBeVisible();
  await expect(page.getByText('Ready offline')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('offline-capture-ready.png'),
    fullPage: true,
  });

  if (browserName === 'webkit') {
    // Chromium proves a full network-offline navigation. Playwright cannot
    // reliably toggle WebKit offline without transient origin-storage errors,
    // so WebKit instead proves reload with cached subresources unavailable
    // from the network while retaining normal document/origin storage access.
    await context.route('**/*', (route) =>
      route.request().resourceType() === 'document'
        ? route.continue()
        : route.abort('internetdisconnected'),
    );
  } else {
    await context.setOffline(true);
  }
  await page.reload();
  await openExistingStudio(page, 'Ateliera');

  await expect(page.getByText('The hill')).toBeVisible();
  await expect(page.getByText('Ready offline')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test('falls back to IndexedDB when OPFS is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: undefined,
    });
  });

  await page.goto('/');
  await createLocalStudio(page);
  await page.getByRole('button', { name: 'Capture' }).click();
  await page
    .getByRole('textbox', { name: 'What would you like remembered?' })
    .fill('The garden');
  await page.getByRole('button', { name: 'Remember' }).click();
  await expect(page.getByText('The garden')).toBeVisible();
  await page.waitForFunction(async () => {
    const request = indexedDB.open('ateliera-browser-vaults', 3);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), {
        once: true,
      });
      request.addEventListener('error', () => reject(request.error), {
        once: true,
      });
    });
    const transaction = database.transaction('files', 'readonly');
    const count = transaction.objectStore('files').count();
    const result = await new Promise<number>((resolve, reject) => {
      count.addEventListener('success', () => resolve(count.result), {
        once: true,
      });
      count.addEventListener('error', () => reject(count.error), {
        once: true,
      });
    });
    database.close();
    return result > 0;
  });
  await page.reload();
  await openExistingStudio(page, 'Ateliera');

  await expect(page.getByText('The garden')).toBeVisible();
});

test('restores focus and keeps private captures out of app-shell caches', async ({
  page,
}) => {
  await page.goto('/');
  await createLocalStudio(page);
  const capture = page.getByRole('button', { name: 'Capture' });
  await capture.click();
  await page
    .getByRole('textbox', { name: 'What would you like remembered?' })
    .fill('A private childhood hill');
  await page.getByRole('button', { name: 'Remember' }).click();
  await expect(capture).toBeFocused();
  const focusColor = await capture.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--studio-color-focus)';
    element.parentElement?.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect
    .poll(() =>
      capture.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          color: style.outlineColor,
          style: style.outlineStyle,
          width: style.outlineWidth,
        };
      }),
    )
    .toEqual({ color: focusColor, style: 'solid', width: '3px' });

  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      if (!name.startsWith('studio-app-shell-')) continue;
      for (const request of await (await caches.open(name)).keys()) {
        urls.push(request.url);
      }
    }
    return urls;
  });
  expect(cachedUrls.join('\n')).not.toContain('private');
  expect(cachedUrls.join('\n')).not.toContain('hill');
  expect(
    cachedUrls.every(
      (url) => !url.startsWith('blob:') && !url.startsWith('data:'),
    ),
  ).toBe(true);
  expect(
    cachedUrls.every((url) => new URL(url).origin === 'http://127.0.0.1:4173'),
  ).toBe(true);
});
