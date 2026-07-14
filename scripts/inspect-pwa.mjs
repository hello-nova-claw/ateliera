import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { inspectPwaArtifact } from './lib/release-artifacts.mjs';

const root = resolve(process.argv[2] ?? 'apps/studio/dist');
const report = await inspectPwaArtifact(root);
const destination = process.env.STUDIO_RELEASE_EVIDENCE;
if (destination) {
  await mkdir(destination, { recursive: true });
  await writeFile(
    resolve(destination, 'pwa-artifact.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(JSON.stringify(report, null, 2));
if (report.issues.length > 0) process.exitCode = 1;
