import { spawnSync } from 'node:child_process';

export function verifyDiskImage(path, runner = spawnSync) {
  const result = runner('hdiutil', ['verify', path], { encoding: 'utf8' });
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    verified: result.status === 0,
  };
}
