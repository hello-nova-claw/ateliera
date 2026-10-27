import { expect, test } from 'vitest';

import { scan } from '../../bin/check-privacy.mjs';

const rulesFor = (path: string, text: string, config = {}) =>
  scan([{ path, text }], { allowNetwork: [], exceptions: [], ...config }).map(
    (f) => f.rule,
  );

const app = 'apple/Ateliera/Journal/JournalView.swift';

test('network calls fail outside the allowlist', () => {
  expect(rulesFor(app, 'let s = URLSession.shared')).toEqual(['network']);
  expect(rulesFor(app, 'let w = WKWebView()')).toEqual(['network']);
  expect(rulesFor(app, 'let u = URL(string: "https://example.com")')).toEqual([
    'network',
  ]);
  expect(rulesFor('apps/studio/src/app/App.tsx', "await fetch('/x')")).toEqual([
    'network',
  ]);
  expect(rulesFor('packages/ui/src/X.tsx', 'navigator.sendBeacon(u)')).toEqual([
    'network',
  ]);
  expect(
    rulesFor(app, 'let s = URLSession.shared', {
      allowNetwork: [{ path: app, reason: 'r' }],
    }),
  ).toEqual([]);
});

test('print and unredacted log interpolation fail', () => {
  expect(rulesFor(app, 'print(note.body)')).toEqual(['logging']);
  expect(rulesFor(app, 'NSLog("x")')).toEqual(['logging']);
  expect(rulesFor(app, 'logger.info("Saved \\(note.title)")')).toEqual([
    'logging',
  ]);
  expect(
    rulesFor(app, 'logger.info("Saved \\(note.title, privacy: .private)")'),
  ).toEqual([]);
  expect(rulesFor(app, 'logger.info("Saved")')).toEqual([]);
  expect(rulesFor(app, 'let blueprint = 1')).toEqual([]);
});

test('file writes without protection fail', () => {
  expect(rulesFor(app, 'try data.write(to: url)')).toEqual(['file-protection']);
  expect(rulesFor(app, 'try data.write(to: url, options: [.atomic])')).toEqual([
    'file-protection',
  ]);
  expect(
    rulesFor(
      app,
      'try data.write(to: url, options: [.atomic, .completeFileProtection])',
    ),
  ).toEqual([]);
  expect(rulesFor(app, 'fm.createFile(atPath: p, contents: d)')).toEqual([
    'file-protection',
  ]);
  expect(
    rulesFor(
      app,
      'fm.createFile(atPath: p, contents: d, attributes: [.protectionKey: FileProtectionType.complete])',
    ),
  ).toEqual([]);
});

test('fixed font sizes and hard-coded colours fail outside the theme', () => {
  expect(rulesFor(app, '.font(.system(size: 12))')).toEqual(['font-size']);
  expect(rulesFor(app, 'Color(red: 0.1, green: 0.2, blue: 0.3)')).toEqual([
    'colour',
  ]);
  expect(rulesFor(app, 'Color(hex: 0xffffff)')).toEqual(['colour']);
  expect(
    rulesFor('apple/Ateliera/Theme/StudioTheme.swift', 'Color(hex: 0xffffff)'),
  ).toEqual([]);
});

test('analytics, ads and attribution SDKs fail in any manifest', () => {
  expect(rulesFor('package.json', '"@sentry/browser": "^8.0.0"')).toEqual([
    'sdk',
  ]);
  expect(
    rulesFor('apps/studio/src-tauri/Cargo.toml', 'reqwest = "0.12"'),
  ).toEqual(['sdk']);
  expect(
    rulesFor('apple/project.yml', 'packages:\n  Firebase:\n    url: x'),
  ).toEqual(['sdk', 'spm']);
  expect(rulesFor('package.json', '"react": "19.0.0"')).toEqual([]);
});

test('tests and comments are not app code', () => {
  expect(rulesFor('apple/AtelieraTests/X.swift', 'print(x)')).toEqual([]);
  expect(rulesFor('packages/ui/src/X.test.tsx', "fetch('/x')")).toEqual([]);
  expect(rulesFor(app, '// print(x) is banned')).toEqual([]);
});

test('an exception allows up to its count in one file, and names its issue', () => {
  const exceptions = [{ rule: 'font-size', path: app, count: 1, issue: 80 }];
  expect(rulesFor(app, '.font(.system(size: 12))', { exceptions })).toEqual([]);
  expect(
    rulesFor(app, '.font(.system(size: 12))\n.font(.system(size: 14))', {
      exceptions,
    }),
  ).toEqual(['font-size']);
});

test('qualified and global forms are caught too', () => {
  expect(rulesFor('packages/ui/src/X.tsx', 'window.fetch(u)')).toEqual([
    'network',
  ]);
  expect(rulesFor('packages/ui/src/X.tsx', 'globalThis.fetch(u)')).toEqual([
    'network',
  ]);
  expect(rulesFor('apps/studio/src/sw.ts', 'self.fetch(u)')).toEqual([
    'network',
  ]);
  expect(rulesFor(app, 'Swift.print(entry)')).toEqual(['logging']);
  expect(rulesFor(app, 'Text(t).font(Font.system(size: 12))')).toEqual([
    'font-size',
  ]);
  expect(rulesFor(app, '.font(\n  .system(\n    size: 12))')).toEqual([
    'font-size',
  ]);
});

test('a blank line in the packages block hides nothing', () => {
  const yml =
    'packages:\n  Allowed:\n    url: a\n\n  Hidden:\n    url: b\ntargets:\n  App: {}\n';
  expect(
    rulesFor('apple/project.yml', yml, { allowSwiftPackages: ['Allowed'] }),
  ).toEqual(['spm']);
});
