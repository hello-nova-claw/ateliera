import { spawnSync } from 'node:child_process';

export function unexpectedMacAppBundles(paths, expected = 'Ateliera.app') {
  return [
    ...new Set(
      paths.flatMap((path) => {
        const match = /^macos\/([^/]+\.app)\//u.exec(path);
        return match && match[1] !== expected ? [match[1]] : [];
      }),
    ),
  ].sort();
}

export function verifyDiskImage(path, runner = spawnSync) {
  const result = runner('hdiutil', ['verify', path], { encoding: 'utf8' });
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    verified: result.status === 0,
  };
}
