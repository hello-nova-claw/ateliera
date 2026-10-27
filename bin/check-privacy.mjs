#!/usr/bin/env node
// Enforces the machine-checkable parts of the Privacy section of CONTRIBUTING.md.
// Every allowlist entry and exception names its reason or issue, so nothing is
// silently allowed. docs/privacy.md must list every allowed network path.
//
// Usage: node bin/check-privacy.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const config = {
  // Files allowed to talk to the network, each with its reason in docs/privacy.md.
  allowNetwork: [
    {
      path: 'apps/studio/src/app/App.tsx',
      reason: 'Same-origin manifest check for the app shell.',
    },
    {
      path: 'apps/studio/src/app/service-worker.ts',
      reason: 'Caches and serves the app’s own files.',
    },
  ],
  // Swift packages allowed in apple/project.yml. None today.
  allowSwiftPackages: [],
  // Existing violations, each tracked by an issue. A file may not exceed its count.
  exceptions: [
    {
      rule: 'file-protection',
      path: 'apple/Ateliera/DataManagement/ExportView.swift',
      count: 1,
      issue: 36,
    },
    {
      rule: 'file-protection',
      path: 'apple/Ateliera/VaultStore.swift',
      count: 5,
      issue: 130,
    },
    {
      rule: 'font-size',
      path: 'apple/Ateliera/RootView.swift',
      count: 16,
      issue: 80,
    },
    ...[
      'Constellation/ConstellationView.swift',
      'Foyer/FoyerHero.swift',
      'Journal/JournalView.swift',
      'Landscape/LandscapeRoomView.swift',
      'Reflection/ReflectionView.swift',
      'Rhythm/AlmanacView.swift',
      'Rhythm/SkyAheadView.swift',
      'Search/BacklinksView.swift',
      'Wisdom/WisdomView.swift',
      'Workshop/WorkshopView.swift',
    ].map((file) => ({
      rule: 'font-size',
      path: `apple/Ateliera/${file}`,
      count: 1,
      issue: 80,
    })),
    {
      rule: 'font-size',
      path: 'apple/AtelieraWidgets/RhythmWidget.swift',
      count: 1,
      issue: 87,
    },
    {
      rule: 'colour',
      path: 'apple/AtelieraWidgets/RhythmWidget.swift',
      count: 3,
      issue: 87,
    },
  ],
};

const sdkNames = [
  'firebase',
  'crashlytics',
  'sentry',
  'bugsnag',
  'rollbar',
  'datadog',
  'newrelic',
  'mixpanel',
  'amplitude',
  'posthog',
  'hotjar',
  'logrocket',
  'fullstory',
  'telemetrydeck',
  'appcenter',
  'appsflyer',
  'kochava',
  'facebook',
  'fbsdk',
  'google-analytics',
  'googleanalytics',
  'gtag',
  'admob',
  'google-mobile-ads',
  'applovin',
  'unity-ads',
  'onesignal',
  'reqwest',
  'ureq',
  'hyper',
  'isahc',
  'axios',
  'node-fetch',
  '@segment/analytics-next',
  'react-native-branch',
  'adjust_sdk',
];

const isTest = (path) =>
  /(^|\/)(AtelieraTests|AtelieraUITests|tests?)\//.test(path) ||
  /\.(test|spec|stories)\.tsx?$/.test(path) ||
  /(^|\/)[^/]*tests?\.rs$/.test(path);

const isSwift = (path) => /^apple\/.*\.swift$/.test(path);
const isWebCode = (path) =>
  /^(apps|packages)\/[^/]+\/src\/.*\.(ts|tsx|js|mjs)$/.test(path);
const isTheme = (path) => /^apple\/Ateliera\/Theme\//.test(path);
const isManifest = (path) =>
  /(^|\/)package\.json$/.test(path) ||
  /(^|\/)Cargo\.toml$/.test(path) ||
  path === 'apple/project.yml';

// Strips // comments so documentation that names a banned call doesn't trip the check.
const code = (line) => line.replace(/\/\/.*$/, '');

const lineRules = [
  {
    rule: 'network',
    applies: (path) => isSwift(path) || isWebCode(path),
    test: (line) =>
      /\b(URLSession|WKWebView|NWConnection|SFSafariViewController|ASWebAuthenticationSession)\b/.test(
        line,
      ) ||
      /URL\(string:\s*"https?:/.test(line) ||
      /(^|[^\w.])fetch\(|\bXMLHttpRequest\b|\bWebSocket\(|\bEventSource\(|sendBeacon\(/.test(
        line,
      ),
    message:
      'Network access outside the allowlist in bin/check-privacy (CONTRIBUTING.md, Privacy).',
  },
  {
    rule: 'logging',
    applies: isSwift,
    test: (line) =>
      /(^|[^\w.])(print|debugPrint|dump|NSLog|os_log)\(/.test(line) ||
      (/\b(logger|log|Logger)\.(debug|info|notice|log|warning|error|fault|critical|trace)\(/.test(
        line,
      ) &&
        /\\\(/.test(line) &&
        !/privacy:\s*\.(private|sensitive)/.test(line)),
    message:
      'Use os.Logger with privacy: .private on interpolated values; never print (CONTRIBUTING.md, Privacy).',
  },
  {
    rule: 'file-protection',
    applies: isSwift,
    test: (line) =>
      (/\.write\(to:/.test(line) &&
        !/completeFileProtection|completeUnlessOpen/.test(line)) ||
      (/createFile\(atPath:/.test(line) && !/protectionKey/.test(line)),
    message:
      'Write personal data with .completeFileProtection (CONTRIBUTING.md, Privacy).',
  },
  {
    rule: 'font-size',
    applies: isSwift,
    test: (line) => /\.font\(\.system\(size:/.test(line),
    message:
      'Use a Dynamic Type text style, not a fixed size (CONTRIBUTING.md, Code).',
  },
  {
    rule: 'colour',
    applies: (path) => isSwift(path) && !isTheme(path),
    test: (line) =>
      /\b(Color|UIColor|NSColor)\((red|hex|white|displayP3):|#colorLiteral/.test(
        line,
      ),
    message:
      'Take colours from the theme tokens or the asset catalogue (CONTRIBUTING.md, Code).',
  },
];

export function scan(
  files,
  { allowNetwork, exceptions, allowSwiftPackages = [] },
) {
  const findings = [];
  for (const { path, text } of files) {
    if (isTest(path)) continue;
    const lines = text.split('\n');
    for (const { rule, applies, test, message } of lineRules) {
      if (!applies(path)) continue;
      if (
        rule === 'network' &&
        allowNetwork.some((entry) => entry.path === path)
      )
        continue;
      const hits = [];
      lines.forEach((line, i) => {
        if (test(code(line))) hits.push(i + 1);
      });
      const exception = exceptions.find(
        (e) => e.rule === rule && e.path === path,
      );
      if (!exception) {
        for (const line of hits) findings.push({ rule, path, line, message });
      } else if (hits.length > exception.count) {
        findings.push({
          rule,
          path,
          line: hits[hits.length - 1],
          message: `${hits.length} found where #${exception.issue} allows ${exception.count}. ${message}`,
        });
      }
    }
    if (isManifest(path)) {
      const lower = text.toLowerCase();
      for (const name of sdkNames) {
        const re = new RegExp(
          `(^|["'\\s/@])${name.replace(/[-]/g, '[-_]?')}(["'\\s/:=-]|$)`,
          'm',
        );
        if (re.test(lower)) {
          findings.push({
            rule: 'sdk',
            path,
            line: lower.split('\n').findIndex((l) => re.test(l)) + 1,
            message: `"${name}" is a network, analytics, advertising or attribution package (CONTRIBUTING.md, Privacy).`,
          });
          break;
        }
      }
      if (path === 'apple/project.yml') {
        const block = /^packages:\s*\n((?:[ \t]+.*\n?)*)/m.exec(text);
        const names = block
          ? [...block[1].matchAll(/^ {2}([\w-]+):/gm)].map((m) => m[1])
          : [];
        for (const name of names) {
          if (!allowSwiftPackages.includes(name)) {
            findings.push({
              rule: 'spm',
              path,
              line: 1,
              message: `Swift package "${name}" is not on the allowlist in bin/check-privacy.`,
            });
          }
        }
      }
    }
  }
  return findings;
}

function main() {
  const paths = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(
      (path) =>
        (isSwift(path) || isWebCode(path) || isManifest(path)) && !isTest(path),
    );
  const files = paths.map((path) => ({
    path,
    text: readFileSync(path, 'utf8'),
  }));
  const findings = scan(files, config);
  for (const { path, line, message } of findings)
    console.log(`::error file=${path},line=${line}::${message}`);
  const privacyDoc = readFileSync('docs/privacy.md', 'utf8');
  const undocumented = config.allowNetwork.filter(
    (entry) => !privacyDoc.includes(entry.path),
  );
  for (const { path } of undocumented) {
    console.log(
      `::error file=bin/check-privacy.mjs::${path} is allowed network access but is not named in docs/privacy.md.`,
    );
  }
  if (findings.length + undocumented.length > 0) process.exit(1);
  console.log(`Privacy check passed: ${files.length} files.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
