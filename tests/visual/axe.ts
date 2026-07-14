import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

export async function analyzeStory(
  page: Page,
): ReturnType<AxeBuilder['analyze']> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await new AxeBuilder({ page }).analyze();
    } catch (reason) {
      if (
        !(reason instanceof Error) ||
        !reason.message.includes('Axe is already running') ||
        attempt === 9
      ) {
        throw reason;
      }
      await page.waitForTimeout(100);
    }
  }
  throw new Error('Story accessibility analysis did not settle.');
}
