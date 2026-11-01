import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'vitest';

// The Apple app's UI-test launch switches (ATELIERA_UITEST…) seed fixture vaults and fake
// services. They belong to debug builds only, so a release binary carries none of them.
const roots = ['apple/Ateliera', 'apple/AtelieraWidgets'];

async function swiftFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'Generated' ? [] : swiftFiles(path);
      return entry.name.endsWith('.swift') ? [path] : [];
    }),
  );
  return nested.flat();
}

// Lines that mention a switch in code (not a comment) outside an `#if DEBUG` block.
function ungatedSwitches(text: string): number[] {
  const stack: boolean[] = [];
  const lines: number[] = [];
  text.split('\n').forEach((line, index) => {
    const code = line.replace(/\/\/.*$/u, '').trim();
    if (/^#if\b/u.test(code)) stack.push(/^#if\s+DEBUG\b/u.test(code));
    else if (/^#(else|elseif)\b/u.test(code)) {
      // The other branch of an `#if DEBUG` is the release build.
      stack.pop();
      stack.push(false);
    }
    else if (/^#endif\b/u.test(code)) stack.pop();
    else if (code.includes('ATELIERA_UITEST') && !stack.includes(true)) lines.push(index + 1);
  });
  return lines;
}

test('finds a switch outside #if DEBUG, and none inside it or in a comment', () => {
  expect(ungatedSwitches('let a = env["ATELIERA_UITEST"]')).toEqual([1]);
  expect(
    ungatedSwitches('#if DEBUG\nlet a = env["ATELIERA_UITEST"]\n#else\nlet b = env["ATELIERA_UITEST_AI"]\n#endif'),
  ).toEqual([4]);
  expect(ungatedSwitches('// ATELIERA_UITEST pins the clock')).toEqual([]);
});

test('every UI-test switch in the app is inside #if DEBUG', async () => {
  const offenders: string[] = [];
  for (const root of roots) {
    for (const file of await swiftFiles(root)) {
      const lines = ungatedSwitches(await readFile(file, 'utf8'));
      offenders.push(...lines.map((line) => `${file}:${line}`));
    }
  }
  expect(offenders).toEqual([]);
});
