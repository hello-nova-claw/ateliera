import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { inspectPwaArtifact } from '../../scripts/lib/release-artifacts.mjs';

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'studio-release-'));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<script src="/assets/app.js"></script>');
  await writeFile(join(root, 'assets/app.js'), 'console.log("studio")');
  await writeFile(join(root, 'service-worker.js'), 'const cache = "studio-app-shell-test";');
  await writeFile(
    join(root, 'manifest.webmanifest'),
    JSON.stringify({
      display: 'standalone',
      icons: [
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        { src: '/maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      ],
      name: 'The Studio',
      scope: '/',
      short_name: 'Studio',
      start_url: '/',
    }),
  );
  await writeFile(join(root, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(join(root, 'maskable.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const entries = [
    '/',
    '/assets/app.js',
    '/icon.svg',
    '/manifest.webmanifest',
    '/maskable.svg',
  ].map((url) => ({ revision: 'a'.repeat(64), url }));
  await writeFile(
    join(root, 'studio-precache-manifest.json'),
    JSON.stringify({ entries, version: 'fixture' }),
  );
  return root;
}

describe('PWA release artifact inspection', () => {
  test('accepts an installable, local-only, completely precached artifact', async () => {
    const report = await inspectPwaArtifact(await fixture());

    expect(report.issues).toEqual([]);
    expect(report.metrics.javascriptBytes).toBeGreaterThan(0);
    expect(report.metrics.precacheEntries).toBe(5);
  });

  test('rejects prototype runtime, remote URLs, and an incomplete precache', async () => {
    const root = await fixture();
    await writeFile(
      join(root, 'assets/app.js'),
      'fetch("https://example.com") /* The Studio.dc.html */',
    );
    const manifest = JSON.parse(
      await (await import('node:fs/promises')).readFile(
        join(root, 'studio-precache-manifest.json'),
        'utf8',
      ),
    ) as { entries: Array<{ revision: string; url: string }>; version: string };
    manifest.entries = manifest.entries.filter(({ url }) => url !== '/assets/app.js');
    await writeFile(
      join(root, 'studio-precache-manifest.json'),
      JSON.stringify(manifest),
    );

    const report = await inspectPwaArtifact(root);

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('prototype'),
        expect.stringContaining('remote URL'),
        expect.stringContaining('/assets/app.js'),
      ]),
    );
  });
});
