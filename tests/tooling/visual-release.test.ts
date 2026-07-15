import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

describe('visual release harness', () => {
  it('audits rendered stories without treating Storybook chrome as app structure', async () => {
    const helper = await readFile(resolve(root, 'tests/visual/axe.ts'), 'utf8');

    expect(helper).toContain(".include('#storybook-root')");
    expect(helper).not.toContain('.disableRules(');
  });

  it('uses one visual worker to keep browser and screenshot evidence stable', async () => {
    const config = await readFile(
      resolve(root, 'playwright.visual.config.ts'),
      'utf8',
    );

    expect(config).toContain('retries: process.env.CI ? 1 : 0');
    expect(config).toContain('workers: 1');
  });
});
