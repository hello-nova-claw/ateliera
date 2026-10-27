import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

it('keeps the macOS Rust audit exceptions target-scoped and documented', () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf8'),
  ) as {
    scripts?: Record<string, string>;
  };
  const script = readFileSync(
    resolve(root, 'scripts/audit-rust-macos.mjs'),
    'utf8',
  );
  const triage = readFileSync(
    resolve(root, 'docs/security/dependency-audit.md'),
    'utf8',
  );

  expect(packageJson.scripts?.['audit:rust:macos']).toBe(
    'node scripts/audit-rust-macos.mjs',
  );
  expect(script).toContain('aarch64-apple-darwin');
  expect(script).toContain('x86_64-apple-darwin');
  expect(script).toContain("'RUSTSEC-2026-0194'");
  expect(script).toContain("'RUSTSEC-2026-0195'");
  expect(script.match(/RUSTSEC-2026-/g)).toHaveLength(2);
  expect(triage).toContain('RUSTSEC-2026-0194');
  expect(triage).toContain('RUSTSEC-2026-0195');
});
