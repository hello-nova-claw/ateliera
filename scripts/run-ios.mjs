import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import { rustEnvironment } from './lib/rust-environment.mjs';

// Thin wrapper around `tauri ios <args>`, mirroring run-tauri.mjs: it runs from
// apps/studio (where src-tauri lives) with the repo-local Rust toolchain on PATH.
const root = resolve(import.meta.dirname, '..');
const { env } = await rustEnvironment(root);
const child = spawn('pnpm', ['exec', 'tauri', 'ios', ...process.argv.slice(2)], {
  cwd: resolve(root, 'apps/studio'),
  env,
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
