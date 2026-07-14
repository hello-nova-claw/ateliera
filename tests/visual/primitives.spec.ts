import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { analyzeStory } from './axe';

const screenshotsDirectory = path.resolve('artifacts/visual/task-2');

test.beforeAll(async () => {
  await mkdir(screenshotsDirectory, { recursive: true });
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`Card primitives are accessible at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/iframe.html?id=primitives-card--reflection&viewMode=story');
    await expect(page.getByRole('article', { name: 'What I learned' })).toBeVisible();

    const accessibility = await analyzeStory(page);
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({
      path: path.join(screenshotsDirectory, `card-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
    await expect(page).toHaveScreenshot(`card-${viewport.width}x${viewport.height}.png`, {
      fullPage: true,
    });
  });
}

test('Card action is keyboard focusable, activatable, and at least 44px square', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=primitives-card--reflection&viewMode=story');
  const action = page.getByRole('button', { name: 'Open reflection' });

  for (let press = 0; press < 5 && !(await action.evaluate((element) => element === document.activeElement)); press += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(action).toBeFocused();
  const dimensions = await action.evaluate((element) => {
    const { height, width } = element.getBoundingClientRect();
    return { height, width };
  });
  expect(dimensions.height).toBeGreaterThanOrEqual(44);
  expect(dimensions.width).toBeGreaterThanOrEqual(44);

  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Reflection opened');
});

test('Card has no transition or animation duration with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/iframe.html?id=primitives-card--reflection&viewMode=story');
  const timing = await page.getByRole('article').evaluate((card) => {
    const style = getComputedStyle(card);
    return {
      animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration,
    };
  });

  expect(timing).toEqual({ animationDuration: '0s', transitionDuration: '0s' });
});

test('Semantic mark remains visible and text-accessible in forced colors', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/iframe.html?id=primitives-semanticmark--all-meanings&viewMode=story');

  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  for (const label of [
    'Foundations',
    'Vision',
    'Growth',
    'Reflection',
    'Celebration',
    'Uncharted',
  ]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  const heart = page.locator('.semantic-mark__heart').first();
  await expect(heart).toBeVisible();
  const forcedColor = await heart.evaluate((element) => {
    const reference = document.createElement('span');
    reference.style.color = 'CanvasText';
    document.body.append(reference);
    const result = {
      canvasText: getComputedStyle(reference).color,
      stroke: getComputedStyle(element).stroke,
    };
    reference.remove();
    return result;
  });
  expect(forcedColor.stroke).toBe(forcedColor.canvasText);
});
