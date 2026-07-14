import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const nativeRoot = resolve(root, 'apps/studio/src-tauri');
const pinnedCargo = resolve(root, '.toolchains/cargo/bin/cargo');
const cargo = existsSync(pinnedCargo) ? pinnedCargo : 'cargo';
const targets = ['aarch64-apple-darwin', 'x86_64-apple-darwin'];
const ignoredAdvisories = ['RUSTSEC-2026-0194', 'RUSTSEC-2026-0195'];
const triage = readFileSync(resolve(root, 'docs/security/dependency-audit.md'), 'utf8');
const environment = {
  ...process.env,
  CARGO_HOME: resolve(root, '.toolchains/cargo'),
  RUSTUP_HOME: resolve(root, '.toolchains/rustup'),
};

function runCargo(arguments_, capture = false) {
  const result = spawnSync(cargo, arguments_, {
    cwd: nativeRoot,
    encoding: 'utf8',
    env: environment,
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) {
      process.stderr.write(result.stdout ?? '');
      process.stderr.write(result.stderr ?? '');
    }
    throw new Error(`cargo ${arguments_.join(' ')} failed with status ${String(result.status)}.`);
  }
  return result.stdout?.trim() ?? '';
}

for (const advisory of ignoredAdvisories) {
  if (!triage.includes(advisory)) {
    throw new Error(`${advisory} is not documented in docs/security/dependency-audit.md.`);
  }
}

for (const target of targets) {
  const graph = runCargo(
    ['tree', '--locked', '--target', target, '-i', 'quick-xml@0.39.4'],
    true,
  );
  if (graph !== '') {
    throw new Error(
      `quick-xml 0.39.4 entered the ${target} dependency graph. Remove the RustSec exceptions before release.\n${graph}`,
    );
  }
}

runCargo([
  'audit',
  ...ignoredAdvisories.flatMap((advisory) => ['--ignore', advisory]),
]);
