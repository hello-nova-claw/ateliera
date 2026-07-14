import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const fixtureArgument = process.argv.slice(2).find((argument) => argument !== '--')
  ?? 'fixtures/vaults/anna-sample';
const fixture = resolve(process.cwd(), fixtureArgument);
const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(
  command,
  ['exec', 'vitest', 'run', 'packages/storage/src/restore-drill.test.ts'],
  {
    cwd: process.cwd(),
    env: { ...process.env, STUDIO_RESTORE_FIXTURE: fixture },
    stdio: 'inherit',
  },
);

if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
