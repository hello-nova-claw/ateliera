import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function tabTo(
  page: Page,
  target: Locator,
  options: { reverse?: boolean; steps?: number } = {},
): Promise<void> {
  const steps = options.steps ?? 100;
  for (let index = 0; index < steps; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
    await page.keyboard.press(options.reverse ? 'Shift+Tab' : 'Tab');
  }
  throw new Error(
    `Keyboard focus did not reach ${await target.getAttribute('aria-label') ?? (await target.textContent()) ?? 'the requested control'}.`,
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
  page,
}) => {
  await page.goto('/');

  const createStudio = page.getByRole('button', { name: 'Create a Studio' });
  await tabTo(page, createStudio);
  await expectVisibleFocus(createStudio);
  await page.keyboard.press('Enter');

  const studioName = page.getByLabel('Studio name');
  await expect(studioName).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Keyboard Studio');
  const create = page.getByRole('button', { name: 'Create', exact: true });
  await tabTo(page, create);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/foyer$/u);

  const capture = page.getByRole('button', { name: 'Capture' }).first();
  await tabTo(page, capture);
  await expectVisibleFocus(capture);
  await page.keyboard.press('Enter');

  const thought = page.getByRole('textbox', {
    name: 'What would you like remembered?',
  });
  await expect(thought).toBeFocused();
  await page.keyboard.type('A quiet keyboard journey');
  const remember = page.getByRole('button', { name: 'Remember' });
  await tabTo(page, remember);
  await page.keyboard.press('Enter');
  await expect(page.locator('.studio-toast')).toHaveText('Remembered.');

  const captured = page.getByRole('button', {
    name: 'A quiet keyboard journey',
  });
  await tabTo(page, captured);
  await page.keyboard.press('Enter');
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor).toBeVisible();
  const markdownBody = page.getByRole('textbox', { name: 'Markdown body' });
  await tabTo(page, markdownBody);
  await expect(markdownBody).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(captured).toBeFocused();

  const search = page.getByRole('link', { name: 'Search' });
  await tabTo(page, search);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/search$/u);
  const query = page.getByRole('searchbox', { name: 'Search your Studio' });
  await tabTo(page, query);
  await page.keyboard.type('quiet keyboard');
  await expect(page.getByRole('button', { name: 'Untitled note' })).toBeVisible();

  const settings = page.getByRole('link', { name: 'Settings' });
  await tabTo(page, settings);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/settings$/u);
  const backup = page.getByRole('button', { name: 'Download portable backup' });
  await tabTo(page, backup);
  await expectVisibleFocus(backup);
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await download).suggestedFilename()).toMatch(/\.zip$/u);

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('mobile navigation and More menu remain keyboard operable and focus-visible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const createStudio = page.getByRole('button', { name: 'Create a Studio' });
  await tabTo(page, createStudio);
  await page.keyboard.press('Enter');
  await page.getByLabel('Studio name').fill('Mobile Keyboard Studio');
  await tabTo(page, page.getByRole('button', { name: 'Create', exact: true }));
  await page.keyboard.press('Enter');

  const more = page.getByRole('button', { name: 'More' });
  await tabTo(page, more);
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
