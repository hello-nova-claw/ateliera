import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

async function startDisposableStudioServer(): Promise<{
  origin: string;
  stop: () => Promise<void>;
}> {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Could not reserve a browser-test port.');
  }
  const port = address.port;
  reservation.close();
  await once(reservation, 'close');

  const appDirectory = resolve(process.cwd(), 'apps/studio');
  const child = spawn(
    resolve(appDirectory, 'node_modules/.bin/vite'),
    ['--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: appDirectory, stdio: 'ignore' },
  );
  const origin = `http://127.0.0.1:${port}`;
  await expect
    .poll(async () => {
      try {
        return (await fetch(origin)).ok;
      } catch {
        return false;
      }
    })
    .toBe(true);

  return {
    origin,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await once(child, 'close');
    },
  };
}

test('captured note survives reload while offline', async ({
  page,
  context,
  browserName,
}, testInfo) => {
  const disposableServer =
    browserName === 'webkit' ? await startDisposableStudioServer() : undefined;
  await page.goto(disposableServer?.origin ?? '/');
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
    await disposableServer?.stop();
  } else {
    await context.setOffline(true);
  }
  await page.reload();

  await expect(page.getByText('The hill')).toBeVisible();
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
