import { expect, test } from 'vitest';

import {
  missingChangelogFragment,
  missingPrivacyDoc,
  missingTests,
} from '../../bin/pr-rules.mjs';

test('app source without a test fails', () => {
  expect(missingTests(['apple/Ateliera/Rhythm/Rhythm.swift'])).toBe(true);
  expect(missingTests(['packages/rhythm/src/rhythm.ts'])).toBe(true);
  expect(missingTests(['apps/studio/src/app/App.tsx'])).toBe(true);
  expect(missingTests(['apple/AtelieraVaultCore/src/lib.rs'])).toBe(true);
  expect(missingTests(['apps/studio/src-tauri/src/vault.rs'])).toBe(true);
});

test('app source with a test passes', () => {
  expect(
    missingTests([
      'apple/Ateliera/Rhythm/Rhythm.swift',
      'apple/AtelieraTests/RhythmTests.swift',
    ]),
  ).toBe(false);
  expect(
    missingTests([
      'packages/rhythm/src/rhythm.ts',
      'packages/rhythm/src/rhythm.test.ts',
    ]),
  ).toBe(false);
  expect(
    missingTests([
      'apps/studio/src-tauri/src/vault.rs',
      'apps/studio/src-tauri/src/secure_tests.rs',
    ]),
  ).toBe(false);
});

test('only spec and test files under tests/ count as tests', () => {
  expect(
    missingTests([
      'packages/rhythm/src/rhythm.ts',
      'tests/e2e/helpers/studio.ts',
    ]),
  ).toBe(true);
  expect(
    missingTests(['packages/rhythm/src/rhythm.ts', 'tests/e2e/foyer.spec.ts']),
  ).toBe(false);
});

test('tests alone, docs, content and assets need no test', () => {
  expect(missingTests(['packages/rhythm/src/rhythm.test.ts'])).toBe(false);
  expect(missingTests(['docs/privacy.md', 'README.md'])).toBe(false);
  expect(missingTests(['packages/rhythm/src/content/micro-seasons.json'])).toBe(
    false,
  );
  expect(missingTests(['apple/Ateliera/Content/invitations.json'])).toBe(false);
  expect(
    missingTests([
      'apple/Ateliera/Assets.xcassets/Hero-spring.imageset/hero-spring.jpg',
    ]),
  ).toBe(false);
  expect(
    missingTests(['apps/studio/src/assets/fonts/figtree-latin.woff2']),
  ).toBe(false);
});

test('a changelog fragment must be added and named after its issue', () => {
  expect(missingChangelogFragment([])).toBe(true);
  expect(missingChangelogFragment(['changelog/notes.txt'])).toBe(true);
  expect(missingChangelogFragment(['changelog/0-zero.txt'])).toBe(true);
  expect(
    missingChangelogFragment(['changelog/132-delete-everything.txt']),
  ).toBe(false);
});

const noUsage = () => '';

test('privacy files need docs/privacy.md', () => {
  expect(
    missingPrivacyDoc(['apple/Ateliera/PrivacyInfo.xcprivacy'], noUsage),
  ).toBe(true);
  expect(missingPrivacyDoc(['apple/Ateliera.entitlements'], noUsage)).toBe(
    true,
  );
  expect(missingPrivacyDoc(['apple/AtelieraWidgets/Info.plist'], noUsage)).toBe(
    true,
  );
  expect(
    missingPrivacyDoc(
      ['apple/Ateliera.entitlements', 'docs/privacy.md'],
      noUsage,
    ),
  ).toBe(false);
});

test('project.yml needs docs/privacy.md only when a usage string changes', () => {
  const usage = () =>
    '+        INFOPLIST_KEY_NSLocationWhenInUseUsageDescription: "…"';
  expect(missingPrivacyDoc(['apple/project.yml'], noUsage)).toBe(false);
  expect(missingPrivacyDoc(['apple/project.yml'], usage)).toBe(true);
  expect(
    missingPrivacyDoc(['apple/project.yml', 'docs/privacy.md'], usage),
  ).toBe(false);
});

test('unrelated changes need nothing', () => {
  expect(missingPrivacyDoc(['packages/rhythm/src/rhythm.ts'], noUsage)).toBe(
    false,
  );
});
