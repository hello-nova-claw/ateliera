import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'vitest';

// Regexes in the Apple app are compiled once, as `static let`s. Compiling one inside a
// function repeats the work on every call, which on a reload means once per note.
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

// Lines that build an NSRegularExpression anywhere but a `static let` initialiser.
function compiledPerCall(text: string): number[] {
  const lines = text.split('\n');
  return lines.flatMap((line, index) => {
    if (!line.includes('NSRegularExpression(')) return [];
    const statement = [lines[index - 1] ?? '', line].join(' ');
    return /static let \w+(: [^=]+)? =/u.test(statement) ? [] : [index + 1];
  });
}

test('flags a regex built in a function, not one held in a static let', () => {
  expect(compiledPerCall('func f() {\n  let r = try? NSRegularExpression(pattern: p)\n}')).toEqual([2]);
  expect(compiledPerCall('static let r = try? NSRegularExpression(pattern: p)')).toEqual([]);
  expect(compiledPerCall('private static let r =\n  try? NSRegularExpression(pattern: p)')).toEqual([]);
});

test('the Apple app compiles every regex once', async () => {
  const offenders: string[] = [];
  for (const file of await swiftFiles('apple/Ateliera')) {
    offenders.push(...compiledPerCall(await readFile(file, 'utf8')).map((line) => `${file}:${line}`));
  }
  expect(offenders).toEqual([]);
});
