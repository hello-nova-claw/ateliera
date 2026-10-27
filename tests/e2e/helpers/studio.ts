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

async function openFromNavigation(page: Page, name: string): Promise<void> {
  const link = page
    .getByRole('navigation', { name: /^Studio (rooms|utilities)$/u })
    .getByRole('link', { name, exact: true });
  if (await link.isVisible()) await link.click();
  else {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  }
}

/**
 * A new Studio starts small: optional rooms and most Foyer sections are off
 * until the person turns them on in Settings. Specs that exercise those rooms
 * turn them on the way a person would, then return to the Foyer.
 */
export async function showEveryRoom(
  page: Page,
  foyerSections: readonly string[] = [],
): Promise<void> {
  await openFromNavigation(page, 'Settings');
  const panel = page.getByRole('region', { name: 'Rooms & sections' });
  await panel.getByRole('button', { name: 'Show every room' }).click();
  await expect(
    panel.getByRole('checkbox', { name: 'Reflection Garden', exact: true }),
  ).toBeChecked();
  for (const section of foyerSections) {
    const toggle = panel.getByRole('checkbox', { name: section, exact: true });
    await toggle.click();
    await expect(toggle).toBeChecked();
  }
  const foyer = page
    .getByRole('navigation', { name: 'Studio rooms' })
    .getByRole('link', { name: 'Foyer', exact: true });
  if (await foyer.isVisible()) await foyer.click();
  else {
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'Home', exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/foyer$/u);
}
