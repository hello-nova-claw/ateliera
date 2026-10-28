import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import ts from 'typescript';
import { expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const uiRoot = resolve(root, 'apps/studio/src');

async function uiSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return uiSources(path);
      if (
        !entry.name.endsWith('.tsx') ||
        entry.name.endsWith('.test.tsx') ||
        entry.name.endsWith('.stories.tsx')
      )
        return [];
      return [path];
    }),
  );
  return nested.flat();
}

test('keeps internal vault terminology out of user-visible application copy', async () => {
  const findings: string[] = [];
  for (const path of await uiSources(uiRoot)) {
    const source = await readFile(path, 'utf8');
    const file = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node): void => {
      const text =
        ts.isJsxText(node) || ts.isStringLiteralLike(node)
          ? node.text
          : undefined;
      if (text !== undefined && /\bvault\b/iu.test(text)) {
        const { line } = file.getLineAndCharacterOfPosition(
          node.getStart(file),
        );
        findings.push(`${path.slice(root.length + 1)}:${line + 1}: ${text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }

  expect(findings).toEqual([]);
});
