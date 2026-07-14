import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function createLocalStudio(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('Foyer Studio');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
}

test('builds the three Foyer foundations atomically and remembers them after reload', async ({
  page,
}, testInfo) => {
  await createLocalStudio(page);
  await expect(page.getByRole('button', { name: /^Add / })).toHaveCount(3);

  for (const [action, value] of [
    ['Add a becoming sentence', 'A woman who creates from calm'],
    ['Add a desired feeling', 'Spacious'],
    [
      'Add a principle',
      'Create enough structure for imagination to surprise me',
    ],
  ] as const) {
    await page.getByRole('button', { name: action }).click();
    await expect(
      page.getByRole('textbox', { name: 'What would you like remembered?' }),
    ).toBeFocused();
    await page
      .getByRole('textbox', { name: 'What would you like remembered?' })
      .fill(value);
    await page.getByRole('button', { name: 'Remember' }).click();
    await expect(page.getByText(value, { exact: true })).toBeVisible();
  }

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('foyer-founded.png'),
    fullPage: true,
  });
  await page.reload();
  await page.getByRole('button', { name: 'Open Foyer Studio' }).click();
  await expect(
    page.getByText('A woman who creates from calm', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Spacious', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Create enough structure for imagination to surprise me', {
      exact: true,
    }),
  ).toBeVisible();
});

test('keeps the fixed Foyer composition usable at mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createLocalStudio(page);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const actions = page.getByRole('button', { name: /^Add / });
  await expect(actions).toHaveCount(3);
  for (let index = 0; index < (await actions.count()); index += 1) {
    const action = actions.nth(index);
    await expect(action).toBeVisible();
    await expect
      .poll(async () => (await action.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
