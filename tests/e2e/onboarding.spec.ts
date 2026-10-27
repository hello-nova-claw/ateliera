import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  enterCreatedStudio,
  openExistingStudio,
  openFromNavigation,
  showEveryRoom,
} from './helpers/studio';

async function createLocalStudio(
  page: Page,
  name = 'Ateliera',
  enter = true,
): Promise<void> {
  await page.getByRole('button', { name: 'Create a new Studio Space' }).click();
  await page.getByLabel('Studio name').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  if (enter) await enterCreatedStudio(page);
}

async function expectSeparatedTourStage(page: Page): Promise<void> {
  const roomBox = await page.locator('.studio-tour-layout__room').boundingBox();
  const guideBox = await page.locator('.first-visit-guide').boundingBox();
  expect(roomBox).not.toBeNull();
  expect(guideBox).not.toBeNull();
  expect(
    guideBox!.y + guideBox!.height <= roomBox!.y ||
      roomBox!.y + roomBox!.height <= guideBox!.y ||
      guideBox!.x + guideBox!.width <= roomBox!.x ||
      roomBox!.x + roomBox!.width <= guideBox!.x,
  ).toBe(true);
}

test('creates a local Studio and enters the Foyer', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('main', { name: 'Ateliera welcome' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Ateliera',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Studio rooms' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: 'Mobile navigation' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Search' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Capture' })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await createLocalStudio(page, 'Anna’s Studio', false);

  await expect(
    page.getByRole('heading', { name: 'Your Studio Space is ready.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Take a gentle tour' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Enter my Studio' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Studio rooms' }),
  ).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await enterCreatedStudio(page);

  await expect(page).toHaveURL(/\/foyer$/);
  await expect(page.getByRole('heading', { name: 'Ateliera' })).toBeVisible();
  const mobile = (page.viewportSize()?.width ?? 1440) < 768;
  await expect(
    page.getByRole('navigation', {
      name: mobile ? 'Mobile navigation' : 'Studio rooms',
    }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Open Anna’s Studio' }),
  ).toBeVisible();
});

test('wanders through five furnished rooms without persisting examples', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await createLocalStudio(page, 'Tour Studio');
  // A new Studio tours only the rooms it shows, so open the whole house first
  // and take the tour from Settings.
  await showEveryRoom(page, ['Feelings', 'Principles']);
  await openFromNavigation(page, 'Settings');
  await page
    .getByRole('region', { name: 'First visit' })
    .getByRole('button', { name: /tour/u })
    .click();

  await expect(page).toHaveURL(/\/foyer$/u);
  await expect(page.getByRole('heading', { name: 'Foyer' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Foyer' }),
  ).toBeFocused();
  await expect(
    page.getByText('A glimpse of what could live here'),
  ).toBeVisible();
  await expect(page.locator('.studio-app-shell')).toHaveAttribute(
    'data-focus-mode',
    'tour',
  );
  await expect(page.locator('.studio-app-shell__rail')).toHaveAttribute(
    'inert',
    '',
  );
  await expect(page.locator('.studio-app-shell__topbar')).toHaveAttribute(
    'inert',
    '',
  );
  await expect(
    page.getByRole('button', { name: 'Next room · Life Landscape' }),
  ).toBeVisible();
  if (testInfo.project.name === 'desktop-chromium') {
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Next room · Life Landscape' }),
    ).toBeFocused();
  }
  await page.keyboard.press('Meta+K');
  await expect(
    page.getByRole('dialog', { name: 'Command palette' }),
  ).toHaveCount(0);
  const searchBox = await page.locator('.studio-topbar__search').boundingBox();
  expect(searchBox).not.toBeNull();
  await page.mouse.click(
    searchBox!.x + searchBox!.width / 2,
    searchBox!.y + searchBox!.height / 2,
  );
  await expect(
    page.getByRole('dialog', { name: 'Command palette' }),
  ).toHaveCount(0);
  await expectSeparatedTourStage(page);
  await expect(
    page.getByRole('article', { name: /^Example .+ card$/u }),
  ).toHaveCount(3);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page
    .getByRole('button', {
      name: 'Use Currently becoming as a starting point',
    })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'What are you currently becoming?' }),
  ).toHaveValue('Someone who creates from calm and trusts her own timing.');
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(
    page.getByRole('article', { name: /^Example .+ card$/u }),
  ).toHaveCount(3);

  await page
    .getByRole('button', {
      name: 'Use Currently becoming as a starting point',
    })
    .click();
  await page.getByRole('button', { name: 'Remember', exact: true }).click();
  await expect(
    page.getByRole('article', { name: /^Example .+ card$/u }),
  ).toHaveCount(2);
  await expect(page.getByText('Currently becoming')).toHaveCount(1);

  await page
    .getByRole('button', { name: 'Next room · Life Landscape' })
    .click();
  await expect(page).toHaveURL(/\/landscape(?:\/[^/]+)?$/u);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Life Landscape' }),
  ).toBeFocused();
  await expect(
    page.getByRole('article', { name: /^Example .+ card$/u }),
  ).toHaveCount(5);
  await expectSeparatedTourStage(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page
    .getByRole('button', { name: 'Next room · Current Season' })
    .click();
  await expect(page).toHaveURL(/\/season$/u);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Current Season' }),
  ).toBeFocused();
  await expect(page.getByText('A season of gentle foundations')).toBeVisible();
  await expect(
    page.getByRole('article', { name: /^Example .+ card$/u }),
  ).toHaveCount(4);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole('button', { name: 'Next room · Uncharted' }).click();
  await expect(page).toHaveURL(/\/uncharted$/u);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Uncharted' }),
  ).toBeFocused();
  await expect(
    page.getByRole('article', { name: /^Example .+ card$/u }),
  ).toHaveCount(2);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page
    .getByRole('button', { name: 'Next room · Reflection Garden' })
    .click();
  await expect(page).toHaveURL(/\/reflection$/u);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Reflection Garden' }),
  ).toBeFocused();
  await expect(
    page.getByRole('article', { name: /^Example .+ card$/u }),
  ).toHaveCount(2);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page
    .getByRole('button', { name: 'Finish tour · Return to Foyer' })
    .click();
  await expect(page).toHaveURL(/\/foyer$/u);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ateliera' }),
  ).toBeFocused();
  await expect(
    page.getByRole('article', { name: /^Example .+ card$/u }),
  ).toHaveCount(0);
  await expect(page.locator('.studio-toast')).toHaveText(
    'The first visit has ended. The Studio is yours.',
  );
  await expect(page.locator('.studio-app-shell')).not.toHaveAttribute(
    'data-focus-mode',
    'tour',
  );
  await expect(page.locator('.studio-app-shell__rail')).not.toHaveAttribute(
    'inert',
  );
});

test('keeps the first visit clear with keyboard, reduced motion, forced colors, and a compact viewport', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'One Chromium presentation-preferences pass covers this cross-platform CSS contract.',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 720, height: 500 });
  await page.goto('/');
  await createLocalStudio(page, 'Accessible Tour Studio', false);

  const begin = page.getByRole('button', { name: 'Take a gentle tour' });
  await begin.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Foyer' })).toBeVisible();
  await expect(page.locator('.studio-tour-layout')).toHaveCSS(
    'animation-name',
    'none',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const next = page.getByRole('button', {
    name: 'Next room · Life Landscape',
  });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Life Landscape' }),
  ).toBeFocused();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Life Landscape' }),
  ).toBeVisible();
  await expectSeparatedTourStage(page);

  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  // A new Studio shows only the Foyer and Life Landscape, so the tour ends here.
  await expect(
    page.getByRole('button', { name: 'Finish tour · Return to Foyer' }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('opens an existing browser Studio', async ({ page }) => {
  await page.goto('/');
  await createLocalStudio(page);
  await page.reload();
  await openExistingStudio(page, 'Ateliera');
  await expect(page).toHaveURL(/\/foyer$/);
});

test('offers to open an existing Studio instead of overwriting it', async ({
  page,
}) => {
  await page.goto('/');
  await createLocalStudio(page);
  await page.reload();
  await page.getByRole('button', { name: 'Create a new Studio Space' }).click();
  await page.getByLabel('Studio name').fill('ateliera');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('already exists');
  await page
    .getByLabel('Create a Studio')
    .getByRole('button', { name: 'Open Ateliera' })
    .click();
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
  await expect(page.getByRole('heading', { name: 'Ateliera' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Open an existing Studio Space' })
    .click();
  await expect(page.getByRole('heading', { name: 'Ateliera' })).toBeVisible();
});

test('changes theme with a keyboard radio menu and remembers it', async ({
  page,
}) => {
  await page.goto('/');
  await createLocalStudio(page);
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
  await page.mouse.click(10, 600);
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
  await createLocalStudio(page);
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
  await createLocalStudio(page);
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
