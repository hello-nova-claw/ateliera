#!/usr/bin/env node
// The pull request rules from CONTRIBUTING.md that a machine can check.
// Usage: node bin/pr-rules.mjs <tests|changelog|privacy-doc> <base-ref>
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const appSource = [
  /^apple\/Ateliera\//,
  /^apple\/AtelieraWidgets\//,
  /^apple\/AtelieraVaultCore\/src\//,
  /^apps\/[^/]+\/src\//,
  /^apps\/studio\/src-tauri\/src\//,
  /^packages\/[^/]+\/src\//,
];

const testFile = [
  /^apple\/AtelieraTests\//,
  /^apple\/AtelieraUITests\//,
  /^apple\/AtelieraVaultCore\/tests\//,
  /^tests\/.*\.(spec|test)\.tsx?$/,
  /\.test\.tsx?$/,
  /(^|\/)[^/]*tests?\.rs$/,
];

// Written content, artwork and fonts are data, not code.
const notCode = [
  /\/content\//,
  /\/Content\//,
  /\.xcassets\//,
  /\/assets\//,
  /\/Fonts\//,
  /\.md$/,
];

const isTest = (path) => testFile.some((re) => re.test(path));

// `changed` includes deleted files, which still trigger a rule; `present` excludes
// them, because a deleted test or doc can't satisfy one.
export function missingTests(changed, present = changed) {
  const code = changed.filter(
    (path) =>
      appSource.some((re) => re.test(path)) &&
      !isTest(path) &&
      !notCode.some((re) => re.test(path)),
  );
  return code.length > 0 && !present.some(isTest);
}

export function missingChangelogFragment(added) {
  return !added.some((path) =>
    /^changelog\/[1-9][0-9]*-[^/]+\.txt$/.test(path),
  );
}

const privacyFile = [
  /PrivacyInfo\.xcprivacy$/,
  /\.entitlements$/,
  /(^|\/)Info\.plist$/,
];

// `usageDiff(path)` returns the diff of a project spec, so a project.yml change
// counts only when it touches a usage-description string.
export function missingPrivacyDoc(changed, usageDiff, present = changed) {
  if (present.includes('docs/privacy.md')) return false;
  if (changed.some((path) => privacyFile.some((re) => re.test(path))))
    return true;
  return changed
    .filter((path) => /^apple\/project\.yml$/.test(path))
    .some((path) => /^[+-].*UsageDescription/m.test(usageDiff(path)));
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

const lines = (text) => text.split('\n').filter(Boolean);

function main([rule, base]) {
  const range = `origin/${base}...HEAD`;
  const changed = lines(git('diff', '--name-only', range));
  const present = lines(git('diff', '--name-only', '--diff-filter=d', range));
  const messages = {
    tests:
      'This pull request changes app sources but no test. Write the test first (CONTRIBUTING.md, Tests).',
    changelog:
      'Add a changelog fragment, changelog/<issue>-<slug>.txt, holding your changelog line, or ask a maintainer for the no-changelog label.',
    'privacy-doc':
      'This pull request changes a privacy manifest, entitlements, Info.plist or a usage-description string without updating docs/privacy.md (CONTRIBUTING.md, Privacy).',
  };
  const failed = {
    tests: () => missingTests(changed, present),
    changelog: () =>
      missingChangelogFragment(
        lines(git('diff', '--name-only', '--diff-filter=A', range)),
      ),
    'privacy-doc': () =>
      missingPrivacyDoc(
        changed,
        (path) => git('diff', range, '--', path),
        present,
      ),
  }[rule];
  if (!failed) {
    console.error(`Unknown rule: ${rule}`);
    process.exit(2);
  }
  if (failed()) {
    console.log(`::error::${messages[rule]}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2));
