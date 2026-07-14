import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

async function read(path: string): Promise<string> {
  return readFile(resolve(root, path), 'utf8');
}

describe('release candidate contract', () => {
  test('exposes one reproducible local release verification command', async () => {
    const packageJson = JSON.parse(await read('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['verify:release']).toBe(
      'node scripts/verify-release.mjs',
    );
  });

  test('runs the release gate on macOS and preserves its evidence', async () => {
    const workflow = await read('.github/workflows/release-candidate.yml');

    expect(workflow).toContain('runs-on: macos-14');
    expect(workflow).toContain('pnpm verify:release');
    expect(workflow).toContain('pnpm exec playwright install chromium webkit');
    expect(workflow).toContain('artifacts/release-evidence');
    expect(workflow).toContain('apps/studio/src-tauri/target/release/bundle');
    expect(workflow).toContain('if: always()');
  });

  test('keeps credentialed signing separate from reproducible verification', async () => {
    const workflow = await read('.github/workflows/release-candidate.yml');

    expect(workflow).not.toContain('APPLE_CERTIFICATE');
    expect(workflow).not.toContain('APPLE_ID');
    expect(workflow).not.toContain('APPLE_PASSWORD');
    expect(workflow).not.toContain('APPLE_TEAM_ID');
  });

  test('documents automated proof, manual assistive-technology gates, and limits', async () => {
    const checklist = await read('docs/testing/release-checklist.md');

    for (const required of [
      'pnpm verify:release',
      'VoiceOver',
      'Safari on iPhone',
      'installed PWA',
      'signed',
      'notarized',
      'not signed or notarized',
      'backup',
      'restore',
      'offline',
      'privacy',
      'known limitations',
      'release-evidence',
    ]) {
      expect(checklist.toLowerCase()).toContain(required.toLowerCase());
    }
  });
});
