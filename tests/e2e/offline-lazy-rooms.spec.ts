import { expect, test, type Page } from '@playwright/test';

async function createLocalStudio(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('Offline Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Ready offline')).toBeVisible();
}

test('opens a never-visited lazy room after Ready offline', async ({
  browserName,
  context,
  page,
}) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await createLocalStudio(page);
  await expect(
    page.getByRole('heading', { name: 'Current Season' }),
  ).toHaveCount(0);

  if (browserName === 'webkit') {
    await context.route('**/*', (route) =>
      route.request().resourceType() === 'document'
        ? route.continue()
        : route.abort('internetdisconnected'),
    );
  } else {
    await context.setOffline(true);
  }

  if ((page.viewportSize()?.width ?? 1440) < 768) {
    await page.keyboard.press('Meta+k');
    await page.getByRole('combobox', { name: 'Find a command' }).fill('season');
    await page.getByRole('option', { name: 'Open Current Season' }).click();
  } else {
    await page.getByRole('link', { name: 'Current Season' }).click();
  }

  await expect(page).toHaveURL(/\/season$/);
  await expect(
    page.getByRole('heading', { name: 'Current Season' }),
  ).toBeVisible();
  await expect(page.getByText('Ready offline')).toBeVisible();
  expect(browserErrors).toEqual([]);
});
