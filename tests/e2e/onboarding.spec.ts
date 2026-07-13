import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('creates a local Studio and enters the Foyer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Capture' })).toBeDisabled();
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('Anna’s Studio');
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
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Open Anna’s Studio' }),
  ).toBeVisible();
});

test('opens an existing browser Studio', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('The Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open The Studio' }).click();
  await expect(page).toHaveURL(/\/foyer$/);
});

test('offers to open an existing Studio instead of overwriting it', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('The Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('the studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('already exists');
  await page.getByRole('button', { name: 'Open existing Studio' }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
});

test('native relaunch requires a fresh session-scoped folder selection', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('studio:opened', 'true');
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {
        invoke: async (command: string) =>
          command === 'vault_select' ? null : undefined,
      },
    });
  });

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Make this space yours.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open this Studio' }).click();
  await expect(
    page.getByRole('heading', { name: 'Make this space yours.' }),
  ).toBeVisible();
});

test('changes theme with a keyboard radio menu and remembers it', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open this Studio' }).click();
  const picker = page.getByRole('button', { name: /Theme/ });
  await picker.click();
  const chamomile = page.getByRole('menuitemradio', {
    name: /Chamomile.*light/,
  });
  const figLeaf = page.getByRole('menuitemradio', { name: /Fig Leaf.*light/ });
  await expect(chamomile).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(figLeaf).toBeFocused();
  await expect(figLeaf).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('End');
  await expect(
    page.getByRole('menuitemradio', { name: /Forest.*dark/ }),
  ).toBeFocused();
  await page.keyboard.press('Home');
  await expect(chamomile).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(
    page.getByRole('menuitemradio', { name: /Forest.*dark/ }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(picker).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);

  await picker.click();
  const forest = page.getByRole('menuitemradio', { name: /Forest.*dark/ });
  await expect(forest).toBeFocused();
  await picker.focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(picker).toBeFocused();

  await picker.click();
  await expect(forest).toBeFocused();
  await page.locator('.studio-room__eyebrow').click();
  await expect(page.getByRole('menu')).toHaveCount(0);

  await picker.click();
  await page.getByRole('menuitemradio', { name: /Deep Ocean.*dark/ }).click();
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
  const search = page.getByRole('button', { name: 'Search' });
  const searchBox = await search.boundingBox();
  expect(searchBox?.width).toBeGreaterThanOrEqual(44);
  expect(searchBox?.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Capture' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Hold this thought' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
