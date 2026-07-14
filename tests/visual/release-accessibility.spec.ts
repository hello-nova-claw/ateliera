import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/visual/task-19-release-accessibility');

const themes = [
  'chamomile',
  'fig-leaf',
  'sunrise',
  'wisteria',
  'deep-ocean',
  'sunset',
  'forest',
] as const;

const viewports = [
  { name: 'wide', width: 1440, height: 1000 },
  { name: 'compact', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

const stressStories = [
  { id: 'rooms-foyer--dense', selector: '.foyer-page' },
  { id: 'rooms-current-season--long-text', selector: '.season-page' },
  { id: 'rooms-uncharted--long-text', selector: '.uncharted-page' },
  { id: 'rooms-reflection-garden--dense', selector: '.reflection-page' },
  { id: 'rooms-search--dense', selector: '.search-page' },
] as const;

test.beforeAll(async () => {
  await mkdir(output, { recursive: true });
});

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  await page.evaluate(() => document.fonts.ready);
}

async function useTheme(page: Page, theme: (typeof themes)[number]): Promise<void> {
  await page.locator('.studio-app').first().evaluate((element, value) => {
    element.setAttribute('data-theme', value);
  }, theme);
}

async function expectContained(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    overflow: [...document.querySelectorAll<HTMLElement>('*')]
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          className: element.className,
          clientWidth: element.clientWidth,
          left: bounds.left,
          right: bounds.right,
          scrollWidth: element.scrollWidth,
          text: element.textContent?.trim().slice(0, 80) ?? '',
        };
      })
      .filter(
        ({ clientWidth, left, right, scrollWidth }) =>
          left < -0.5 ||
          right > document.documentElement.clientWidth + 0.5 ||
          scrollWidth > clientWidth + 0.5,
      )
      .slice(0, 12),
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    metrics.scrollWidth - metrics.clientWidth,
    JSON.stringify(metrics, null, 2),
  ).toBeLessThanOrEqual(0);
}

async function expectAxeClean(page: Page): Promise<void> {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

for (const theme of themes) {
  for (const viewport of viewports) {
    test(`${theme} theme is accessible at ${viewport.name} release viewport`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openStory(page, 'rooms-foyer--full');
      await useTheme(page, theme);
      await expectContained(page);
      await expectAxeClean(page);
      await page.screenshot({
        path: path.join(output, `foyer-${theme}-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
    });
  }
}

for (const story of stressStories) {
  test(`${story.id} supports 200% text and WCAG text spacing`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openStory(page, story.id);
    await page.addStyleTag({
      content: `
        html { font-size: 200%; }
        .studio-app :where(p, li, label, input, textarea, button, a) {
          letter-spacing: 0.12em;
          line-height: 1.5;
          word-spacing: 0.16em;
        }
        .studio-app p { margin-block-end: 2em; }
      `,
    });
    await expect(page.locator(story.selector)).toBeVisible();
    await expectContained(page);
    if (story.id === 'rooms-foyer--dense') {
      const cardWidths = await page
        .locator('.foyer-season__priorities li, .foyer-principle')
        .evaluateAll((cards) =>
          cards.map((card) => card.getBoundingClientRect().width),
        );
      expect(Math.min(...cardWidths)).toBeGreaterThanOrEqual(240);
    }
    await expectAxeClean(page);
    await page.screenshot({
      path: path.join(output, `${story.id}-text-200.png`),
      fullPage: true,
    });
  });
}

test('missing images retain their description and a calm repair state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, 'rooms-foyer--missing-image');
  await expect(page.getByText('Soft morning light across a green hillside')).toBeVisible();
  await expect(page.getByText(/image is not available/iu)).toBeVisible();
  await expectContained(page);
  await expectAxeClean(page);
  await page.screenshot({
    path: path.join(output, 'foyer-missing-image-390x844.png'),
    fullPage: true,
  });
});

test('reduced motion removes non-essential transitions and animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStory(page, 'rooms-uncharted--sparse');
  const movingElements = await page.locator('.studio-app, .studio-app *').evaluateAll((elements) =>
    elements
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          animationDuration: style.animationDuration,
          animationName: style.animationName,
          transitionDuration: style.transitionDuration,
        };
      })
      .filter(
        ({ animationDuration, animationName, transitionDuration }) =>
          (animationName !== 'none' && animationDuration !== '0s') ||
          transitionDuration
            .split(',')
            .some((duration) => Number.parseFloat(duration) > 0),
      ),
  );
  expect(movingElements).toEqual([]);
});

test('forced colors preserves visible focus and semantic boundaries', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await openStory(page, 'rooms-settings-portability--conflict');
  await page.getByLabel('Choose a Studio backup').setInputFiles({
    name: 'studio.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('release accessibility fixture'),
  });
  const firstChoice = page.getByRole('radio').first();
  await firstChoice.focus();
  await expect(firstChoice).toBeFocused();
  await expect(firstChoice).toHaveCSS('outline-style', /^(?:auto|solid)$/);
  await expectAxeClean(page);
  await page.screenshot({
    path: path.join(output, 'portability-conflict-forced-colors.png'),
    fullPage: true,
  });
});

test('mobile interactive targets remain at least 44 by 44 CSS pixels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, 'rooms-search--results');
  await page.getByRole('button', { name: 'Filters' }).click();
  const undersized = await page
    .locator(
      'button:visible, a:visible, input:not([type="checkbox"]):not([type="radio"]):visible, select:visible, textarea:visible',
    )
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            height: rect.height,
            label:
              element.getAttribute('aria-label') ??
              element.textContent?.trim() ??
              element.tagName,
            width: rect.width,
          };
        })
        .filter(({ height, width }) => height < 44 || width < 44),
    );
  expect(undersized).toEqual([]);
});
