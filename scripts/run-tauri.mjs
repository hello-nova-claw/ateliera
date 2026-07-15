import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { rustEnvironment } from './lib/rust-environment.mjs';

const root = resolve(import.meta.dirname, '..');
const { env } = await rustEnvironment(root);
await rm(resolve(root, 'apps/studio/src-tauri/target/release/bundle'), {
  force: true,
  recursive: true,
});
const child = spawn(
  'pnpm',
  ['exec', 'tauri', 'build', '--ci', '--no-sign', '--bundles', 'app', 'dmg'],
  {
    cwd: resolve(root, 'apps/studio'),
    env,
    stdio: 'inherit',
  },
);
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
