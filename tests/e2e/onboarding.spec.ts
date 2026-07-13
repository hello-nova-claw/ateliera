import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('creates a local Studio and enters the Foyer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('The Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page).toHaveURL(/\/foyer$/);
  await expect(page.getByRole('heading', { name: 'The Studio' })).toBeVisible();
  const mobile = (page.viewportSize()?.width ?? 1440) < 768;
  await expect(
    page.getByRole('navigation', {
      name: mobile ? 'Mobile navigation' : 'Studio rooms',
    }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('opens an existing browser Studio', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open this Studio' }).click();
  await expect(page).toHaveURL(/\/foyer$/);
});

test('changes theme with a keyboard radio menu and remembers it', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open this Studio' }).click();
  const picker = page.getByRole('button', { name: /Theme/ });
  await picker.click();
  await page.getByRole('menuitemradio', { name: /Deep Ocean.*dark/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.studio-app')).toHaveAttribute(
    'data-theme',
    'deep-ocean',
  );
  await expect(page.locator('.studio-app')).toHaveCSS('color-scheme', 'dark');
  await page.reload();
  await expect(page.locator('.studio-app')).toHaveAttribute(
    'data-theme',
    'deep-ocean',
  );
});

test('supports command navigation and restores focus after Escape', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open this Studio' }).click();
  await page.keyboard.press('Meta+k');
  const input = page.getByRole('combobox', { name: 'Find a command' });
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Search/ })).toBeFocused();
});

test('mobile shell keeps Capture one tap away without page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open this Studio' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Mobile navigation' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Capture' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Hold this thought' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
