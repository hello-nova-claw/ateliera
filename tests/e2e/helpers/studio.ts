import { expect, type Page } from '@playwright/test';

export async function enterCreatedStudio(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'Your Studio Space is ready.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Enter my Studio' }).click();
  await expect(page).toHaveURL(/\/foyer$/u);
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
}

export async function openExistingStudio(
  page: Page,
  name: string,
): Promise<void> {
  await page.getByRole('button', { name: `Open ${name}` }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
}
