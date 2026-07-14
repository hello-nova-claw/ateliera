import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, readlink, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bundleRoot = resolve(
  root,
  process.argv[2] ?? 'apps/studio/src-tauri/target/release/bundle',
);

async function entries(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const path = relative(bundleRoot, absolute).split(sep).join('/');
    if (entry.isDirectory()) output.push(...(await entries(absolute)));
    else if (entry.isSymbolicLink()) {
      output.push({ path, kind: 'symlink', target: await readlink(absolute) });
    } else if (entry.isFile()) {
      const bytes = await readFile(absolute);
      output.push({
        path,
        kind: 'file',
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
  }
  return output.sort((left, right) => left.path.localeCompare(right.path));
}

function command(commandName, args) {
  const result = spawnSync(commandName, args, { encoding: 'utf8' });
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}

const inventory = await entries(bundleRoot);
const appExecutable = inventory.find(
  ({ path, kind }) => kind === 'file' && /macos\/The Studio\.app\/Contents\/MacOS\/studio-desktop$/u.test(path),
);
const appInfo = inventory.find(
  ({ path, kind }) => kind === 'file' && /macos\/The Studio\.app\/Contents\/Info\.plist$/u.test(path),
);
const dmg = inventory.find(
  ({ path, kind }) => kind === 'file' && path.endsWith('.dmg'),
);
const issues = [];
if (!appExecutable) issues.push('The Studio.app executable is missing.');
if (!appInfo) issues.push('The Studio.app Info.plist is missing.');
if (!dmg) issues.push('The Studio DMG is missing.');
if (inventory.some(({ path }) => /(?:The Studio\.dc\.html|original-mockup|design\/reference)/iu.test(path))) {
  issues.push('The packaged app contains design prototype material.');
}

const appPath = resolve(bundleRoot, 'macos/The Studio.app');
let bundleMetadata = {};
if (appInfo) {
  const plist = command('plutil', ['-convert', 'json', '-o', '-', resolve(bundleRoot, appInfo.path)]);
  if (plist.status !== 0) issues.push(`Info.plist could not be read: ${plist.output}`);
  else bundleMetadata = JSON.parse(plist.output);
}
if (bundleMetadata.CFBundleIdentifier !== 'au.com.annamcphee.thestudio') {
  issues.push('The packaged bundle identifier is not au.com.annamcphee.thestudio.');
}
if (bundleMetadata.CFBundleDisplayName !== 'The Studio') {
  issues.push('The packaged display name is not The Studio.');
}

const codesign = command('codesign', ['--display', '--verbose=4', appPath]);
const signedForDistribution =
  codesign.status === 0 && /Authority=Developer ID Application:/u.test(codesign.output);
const stapler = command('xcrun', ['stapler', 'validate', appPath]);
const notarized = stapler.status === 0;

const report = {
  bundleMetadata: {
    displayName: bundleMetadata.CFBundleDisplayName ?? null,
    identifier: bundleMetadata.CFBundleIdentifier ?? null,
    version: bundleMetadata.CFBundleShortVersionString ?? null,
  },
  distribution: {
    notarized,
    signedForDistribution,
    statement:
      signedForDistribution && notarized
        ? 'Developer ID signed and notarization ticket validated.'
        : 'Signing-ready local artifact; not signed or notarized for distribution.',
  },
  inventory,
  issues,
};

const destination = process.env.STUDIO_RELEASE_EVIDENCE;
if (destination) {
  await mkdir(destination, { recursive: true });
  await writeFile(
    resolve(destination, 'macos-artifact.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(JSON.stringify(report, null, 2));
if (issues.length > 0) process.exitCode = 1;
