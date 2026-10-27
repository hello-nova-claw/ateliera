#!/usr/bin/env node
// Folds changelog fragments into CHANGELOG.md.
//
// Each pull request adds its changelog line as changelog/<issue>-<slug>.txt
// instead of editing CHANGELOG.md, so open pull requests never conflict over
// the same lines. At release time this appends every fragment under
// "## Unreleased", in issue order, and deletes the fragments.
//
// Usage: pnpm changelog
import { readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const UNRELEASED = '## Unreleased';

export function parseFragment(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[*-](\s+|$)/, ''))
    .filter(Boolean);
}

export function foldInto(changelog, entries) {
  if (entries.length === 0) return changelog;
  const lines = changelog.replace(/\n+$/, '').split('\n');
  let start = lines.findIndex((line) => line.trim() === UNRELEASED);
  if (start === -1) {
    const firstRelease = lines.findIndex((line) => line.startsWith('## '));
    const at = firstRelease === -1 ? lines.length : firstRelease;
    lines.splice(at, 0, UNRELEASED, '', ...(firstRelease === -1 ? [] : ['']));
    start = at;
  }
  let end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  if (end === -1) end = lines.length;
  let last = end;
  while (last > start + 1 && lines[last - 1].trim() === '') last -= 1;
  const bullets = entries.map((entry) => `- ${entry}`);
  const lead = last === start + 1 ? [''] : [];
  lines.splice(
    last,
    end - last,
    ...lead,
    ...bullets,
    ...(end < lines.length ? [''] : []),
  );
  return `${lines.join('\n')}\n`;
}

export async function fold(root) {
  const dir = join(root, 'changelog');
  const issue = (name) => Number.parseInt(name, 10) || Infinity;
  const names = (await readdir(dir))
    .filter((name) => name.endsWith('.txt'))
    .sort((a, b) => issue(a) - issue(b) || a.localeCompare(b));
  const entries = [];
  for (const name of names) {
    const parsed = parseFragment(await readFile(join(dir, name), 'utf8'));
    if (parsed.length === 0)
      throw new Error(`changelog/${name} is empty. Add its line or delete it.`);
    entries.push(...parsed);
  }

  // Stage the fragments first, so a failed run can be retried without folding
  // any of them twice, then replace CHANGELOG.md atomically.
  const staged = names.map((name) => [
    join(dir, name),
    join(dir, `${name}.folding`),
  ]);
  const moved = [];
  const file = join(root, 'CHANGELOG.md');
  const temp = `${file}.tmp`;
  try {
    for (const pair of staged) {
      await rename(pair[0], pair[1]);
      moved.push(pair);
    }
    await writeFile(temp, foldInto(await readFile(file, 'utf8'), entries));
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => {});
    for (const [from, to] of moved) await rename(to, from);
    throw error;
  }
  await Promise.all(staged.map(([, to]) => unlink(to)));
  return names.length;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = await fold(resolve(import.meta.dirname, '..'));
  console.log(
    `Folded ${count} changelog fragment${count === 1 ? '' : 's'} into CHANGELOG.md.`,
  );
}
