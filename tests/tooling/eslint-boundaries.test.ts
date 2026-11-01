import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

describe('workspace import boundaries', () => {
  it('rejects relative imports that cross package boundaries', async () => {
    const [result] = await eslint.lintText(
      "import '../../domain/src/index';\nvoid import('../../storage/src/index');",
      { filePath: 'packages/ui/src/forbidden-fixture.ts' },
    );

    expect(result?.messages).toHaveLength(2);
    expect(result?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'studio/no-cross-package-relative-imports',
          severity: 2,
        }),
      ]),
    );
  });

  it('allows relative imports within a package and allowed package imports', async () => {
    const [result] = await eslint.lintText(
      "import './Card';\nimport '@studio/domain';",
      { filePath: 'packages/ui/src/legal-fixture.ts' },
    );

    expect(result?.messages).toEqual([]);
  });

  it.each([
    ['packages/ui/src/forbidden-fixture.ts', '@studio/storage'],
    ['apps/studio/src/forbidden-fixture.ts', '@studio/test-utils'],
  ])('rejects a package import outside the layer of %s', async (filePath, imported) => {
    const [result] = await eslint.lintText(`import '${imported}';`, { filePath });

    expect(result?.messages).toEqual([
      expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 }),
    ]);
  });

  it.each([
    ['packages/ui/src/forbidden-fixture.ts', '@studio/storage'],
    ['apps/studio/src/forbidden-fixture.ts', '@studio/test-utils/fixtures'],
  ])('rejects a dynamic import outside the layer of %s', async (filePath, imported) => {
    const [result] = await eslint.lintText(`void import('${imported}');`, { filePath });

    expect(result?.messages).toEqual([
      expect.objectContaining({ ruleId: 'no-restricted-syntax', severity: 2 }),
    ]);
  });

  it('allows a dynamic import inside the layer', async () => {
    const [result] = await eslint.lintText("void import('@studio/storage/browser');", {
      filePath: 'apps/studio/src/legal-fixture.ts',
    });

    expect(result?.messages).toEqual([]);
  });
});
