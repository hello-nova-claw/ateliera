import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('captured note survives reload while offline', async ({
  page,
  context,
  browserName,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await page.goto('/');
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
    await context.route('**/*', (route) =>
      route.request().resourceType() === 'document'
        ? route.continue()
        : route.abort('internetdisconnected'),
    );
  } else {
    await context.setOffline(true);
  }
  await page.reload();

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
  await page.getByRole('button', { name: 'Capture' }).click();
  await page
    .getByRole('textbox', { name: 'What would you like remembered?' })
    .fill('The garden');
  await page.getByRole('button', { name: 'Remember' }).click();
  await page.reload();

  await expect(page.getByText('The garden')).toBeVisible();
});

test('restores focus and keeps private captures out of app-shell caches', async ({
  page,
}) => {
  await page.goto('/');
  const capture = page.getByRole('button', { name: 'Capture' });
  await capture.click();
  await page
    .getByRole('textbox', { name: 'What would you like remembered?' })
    .fill('A private childhood hill');
  await page.getByRole('button', { name: 'Remember' }).click();
  await expect(capture).toBeFocused();

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
  expect(cachedUrls.every((url) => new URL(url).origin === 'http://127.0.0.1:4173')).toBe(true);
});
