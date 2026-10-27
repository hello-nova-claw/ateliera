import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function tabTo(
  page: Page,
  target: Locator,
  options: { key?: 'Tab' | 'Alt+Tab'; reverse?: boolean; steps?: number } = {},
): Promise<void> {
  const steps = options.steps ?? 100;
  for (let index = 0; index < steps; index += 1) {
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
    const key = options.key ?? 'Tab';
    await page.keyboard.press(
      options.reverse
        ? key === 'Alt+Tab'
          ? 'Alt+Shift+Tab'
          : 'Shift+Tab'
        : key,
    );
  }
  throw new Error(
    `Keyboard focus did not reach ${(await target.getAttribute('aria-label')) ?? (await target.textContent()) ?? 'the requested control'}.`,
  );
}

async function expectVisibleFocus(target: Locator): Promise<void> {
  await expect(target).toBeFocused();
  const focus = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      offset: Number.parseFloat(style.outlineOffset),
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focus.style).not.toBe('none');
  expect(focus.width).toBeGreaterThanOrEqual(2);
  expect(focus.offset).toBeGreaterThanOrEqual(0);
}

test('completes create, capture, edit, search, and backup without a pointer', async ({
  browserName,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'The separate mobile journey proves the compact keyboard path.',
  );
  const key = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.goto('/');

  const createStudio = page.getByRole('button', {
    name: 'Create a new Studio Space',
  });
  await tabTo(page, createStudio, { key });
  await expectVisibleFocus(createStudio);
  await page.keyboard.press('Enter');

  const studioName = page.getByLabel('Studio name');
  await expect(studioName).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Keyboard Studio');
  const create = page.getByRole('button', { name: 'Create', exact: true });
  await tabTo(page, create, { key });
  await page.keyboard.press('Enter');
  const enterStudio = page.getByRole('button', { name: 'Enter my Studio' });
  await expect(enterStudio).toBeVisible();
  await tabTo(page, enterStudio, { key });
  await expectVisibleFocus(enterStudio);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/foyer$/u);

  const capture = page.getByRole('button', { name: 'Capture' }).first();
  await tabTo(page, capture, { key });
  await expectVisibleFocus(capture);
  await page.keyboard.press('Enter');

  const thought = page.getByRole('textbox', {
    name: 'What would you like remembered?',
  });
  await expect(thought).toBeFocused();
  await page.keyboard.type('A quiet keyboard journey');
  const remember = page.getByRole('button', { name: 'Remember' });
  await tabTo(page, remember, { key });
  await page.keyboard.press('Enter');
  await expect(page.locator('.studio-toast')).toHaveText('Remembered.');

  const captured = page.getByRole('button', {
    name: 'A quiet keyboard journey',
  });
  await tabTo(page, captured, { key });
  await page.keyboard.press('Enter');
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor).toBeVisible();
  const markdownBody = page.getByRole('textbox', { name: 'Markdown body' });
  await tabTo(page, markdownBody, { key });
  await expect(markdownBody).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(captured).toBeFocused();

  const search = page.getByRole('link', { name: 'Search' });
  await tabTo(page, search, { key });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/search$/u);
  const query = page.getByRole('searchbox', { name: 'Search your Studio' });
  await tabTo(page, query, { key });
  await page.keyboard.type('quiet keyboard');
  await expect(
    page
      .getByRole('main')
      .getByRole('button', { name: 'A quiet keyboard journey' }),
  ).toBeVisible();

  const settings = page.getByRole('link', { name: 'Settings' });
  await tabTo(page, settings, { key });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/settings$/u);
  const backup = page.getByRole('button', { name: 'Download portable backup' });
  await tabTo(page, backup, { key });
  await expectVisibleFocus(backup);
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await download).suggestedFilename()).toMatch(/\.zip$/u);

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('mobile navigation and More menu remain keyboard operable and focus-visible', async ({
  browserName,
  page,
}) => {
  const key = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const createStudio = page.getByRole('button', {
    name: 'Create a new Studio Space',
  });
  await tabTo(page, createStudio, { key });
  await page.keyboard.press('Enter');
  await page.getByLabel('Studio name').fill('Mobile Keyboard Studio');
  await tabTo(page, page.getByRole('button', { name: 'Create', exact: true }), {
    key,
  });
  await page.keyboard.press('Enter');
  const enterStudio = page.getByRole('button', { name: 'Enter my Studio' });
  await expect(enterStudio).toBeVisible();
  await tabTo(page, enterStudio, { key });
  await expectVisibleFocus(enterStudio);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/foyer$/u);

  const more = page.getByRole('button', { name: 'More' });
  await tabTo(page, more, { key });
  await expectVisibleFocus(more);
  await page.keyboard.press('Enter');
  const first = page.getByRole('menuitem').first();
  await expect(first).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
