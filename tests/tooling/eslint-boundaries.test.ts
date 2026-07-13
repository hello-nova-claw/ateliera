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
});
