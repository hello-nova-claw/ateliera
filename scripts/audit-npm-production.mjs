import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  collectRegistryVersions,
  findBlockingAdvisories,
  flattenAdvisories,
} from './lib/npm-production-audit.mjs';

const root = resolve(import.meta.dirname, '..');
const registry = 'https://registry.npmjs.org';
const endpoint = `${registry}/-/npm/v1/security/advisories/bulk`;
const threshold = 'high';

const dependencyTree = spawnSync(
  'pnpm',
  ['list', '--prod', '--recursive', '--json', '--depth', 'Infinity'],
  { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);

if (dependencyTree.status !== 0) {
  process.stderr.write(dependencyTree.stderr);
  throw new Error('Unable to read the installed production dependency tree.');
}

const versions = collectRegistryVersions(JSON.parse(dependencyTree.stdout));
const packageCount = Object.keys(versions).length;
const versionCount = Object.values(versions).reduce(
  (total, packageVersions) => total + packageVersions.length,
  0,
);

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': `Ateliera release audit (${process.version})`,
  },
  body: JSON.stringify(versions),
});

if (!response.ok) {
  throw new Error(
    `The npm advisory service returned HTTP ${response.status} ${response.statusText}.`,
  );
}

const advisories = await response.json();
const allAdvisories = flattenAdvisories(advisories);
const blockingAdvisories = findBlockingAdvisories(advisories, threshold);

console.log(
  `Audited ${versionCount} installed production versions across ${packageCount} registry packages.`,
);

for (const advisory of allAdvisories) {
  console.log(
    `- ${advisory.severity.toUpperCase()} ${advisory.packageName}: ${advisory.title} (${advisory.url})`,
  );
}

if (blockingAdvisories.length > 0) {
  throw new Error(
    `${blockingAdvisories.length} production advisory or advisories meet the ${threshold} release threshold.`,
  );
}

console.log(
  allAdvisories.length === 0
    ? 'No known production dependency advisories were reported.'
    : `No advisories meet the ${threshold} release threshold.`,
);
