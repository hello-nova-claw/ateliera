import { rmSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StudioNote } from '@studio/domain';

import { createNodeSqliteIndex } from './node-sqlite';

const argument = process.argv.find((value) => value.startsWith('--notes='));
const count = Number(argument?.split('=')[1] ?? 10_000);
if (!Number.isSafeInteger(count) || count < 1 || count > 100_000) throw new Error('--notes must be an integer from 1 to 100000');
const path = join(tmpdir(), `studio-index-benchmark-${process.pid}.sqlite`);
const index = createNodeSqliteIndex(path);

function fixture(position: number): StudioNote {
  const id = `benchmark-${position.toString().padStart(6, '0')}`;
  return {
    schemaVersion: 1, id, title: `Reflection ${position}`,
    body: position % 10 === 0 ? 'A calm spacious morning with meaningful work.' : 'A short reflection about an ordinary day.',
    cardType: 'text', semanticType: 'reflection', status: 'active', rooms: ['reflection-garden'],
    lifeAreas: [position % 2 ? 'family' : 'work'], seasons: ['2026-winter'], tags: ['reflection'],
    created: '2026-07-01T00:00:00.000Z', updated: '2026-07-13T00:00:00.000Z', attachments: [],
    display: { featured: false }, privacy: { sensitivity: 'private', aiAccess: 'never' }, extraFrontmatter: {},
  };
}

try {
  const rebuildStarted = performance.now();
  await index.rebuild(Array.from({ length: count }, (_, position) => ({
    note: fixture(position), path: `Reflection/${position}.md`, hash: `hash-${position}`,
  })));
  const rebuildMs = performance.now() - rebuildStarted;
  await index.search('calm spacious', { semanticTypes: ['reflection'] });
  const searchStarted = performance.now();
  const hits = await index.search('calm spacious', { semanticTypes: ['reflection'] });
  const searchMs = performance.now() - searchStarted;
  console.log(JSON.stringify({ notes: count, rebuildMs: Math.round(rebuildMs), warmSearchMs: Number(searchMs.toFixed(2)), hits: hits.length }));
  if (searchMs >= 200) throw new Error(`Warm search target missed: ${searchMs.toFixed(2)}ms >= 200ms`);
} finally {
  index.close();
  rmSync(path, { force: true });
  rmSync(`${path}-shm`, { force: true });
  rmSync(`${path}-wal`, { force: true });
}
