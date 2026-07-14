import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const evidence = resolve(root, 'artifacts/release-evidence');
await rm(evidence, { force: true, recursive: true });
await mkdir(resolve(evidence, 'logs'), { recursive: true });

const environment = {
  ...process.env,
  CI: process.env.CI ?? '1',
  NO_COLOR: '1',
  STUDIO_RELEASE_EVIDENCE: evidence,
};
delete environment.FORCE_COLOR;

const gates = [
  ['typecheck', 'pnpm', ['typecheck']],
  ['lint', 'pnpm', ['lint']],
  ['workspace-tests', 'pnpm', ['test']],
  ['pwa-build', 'pnpm', ['build:pwa']],
  ['security-tests', 'pnpm', ['test:security']],
  [
    'npm-production-audit',
    'pnpm',
    [
      'audit',
      '--prod',
      '--audit-level',
      'high',
      '--registry',
      'https://registry.npmjs.org',
    ],
  ],
  ['rust-macos-audit', 'pnpm', ['audit:rust:macos']],
  ['restore-drill', 'pnpm', ['verify:restore', '--', 'fixtures/vaults/anna-sample']],
  ['rust-tests', 'pnpm', ['tauri:test']],
  ['rust-format', 'pnpm', ['rust:fmt']],
  ['rust-clippy', 'pnpm', ['rust:clippy']],
  ['production-e2e', 'pnpm', ['test:e2e']],
  ['visual-and-axe', 'pnpm', ['test:visual']],
  ['macos-bundle', 'pnpm', ['tauri:bundle']],
  ['macos-inspection', 'node', ['scripts/inspect-macos-artifact.mjs']],
];

const results = [];
let failure;

async function run(name, command, args) {
  const startedAt = new Date();
  const started = performance.now();
  const log = [];
  process.stdout.write(`\n━━ ${name} ━━\n`);
  const child = spawn(command, args, {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      const text = chunk.toString();
      log.push(text);
      process.stdout.write(text);
    });
  }
  const status = await new Promise((resolveStatus, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) =>
      resolveStatus({ code: code ?? 1, signal: signal ?? null }),
    );
  });
  const result = {
    args,
    command,
    durationMs: Math.round(performance.now() - started),
    finishedAt: new Date().toISOString(),
    name,
    startedAt: startedAt.toISOString(),
    status: status.code === 0 ? 'passed' : 'failed',
    exitCode: status.code,
    signal: status.signal,
  };
  results.push(result);
  await writeFile(resolve(evidence, 'logs', `${name}.log`), log.join(''));
  return result;
}

for (const [name, command, args] of gates) {
  const result = await run(name, command, args);
  if (result.status === 'failed') {
    failure = result;
    break;
  }
}

try {
  await cp(resolve(root, 'artifacts/playwright'), resolve(evidence, 'playwright'), {
    force: true,
    recursive: true,
  });
} catch {
  // A gate can fail before Playwright creates evidence. The manifest records it.
}

try {
  await cp(resolve(root, 'artifacts/visual'), resolve(evidence, 'visual'), {
    force: true,
    recursive: true,
  });
} catch {
  // A gate can fail before the visual suite creates review screenshots.
}

const git = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
});
const manifest = {
  candidate: {
    commit: git.status === 0 ? git.stdout.trim() : null,
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
  },
  distribution: {
    notarized: false,
    signed: false,
    statement:
      'The automated artifact is signing-ready only; Apple credentials and manual notarization are not part of this gate.',
  },
  gates: results,
  outcome: failure ? 'failed' : 'passed',
};
await writeFile(
  resolve(evidence, 'release-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
const summary = [
  '# The Studio release evidence',
  '',
  `- Outcome: **${manifest.outcome}**`,
  `- Commit: \`${manifest.candidate.commit ?? 'unavailable'}\``,
  `- Generated: ${manifest.candidate.generatedAt}`,
  `- Platform: ${manifest.candidate.platform}`,
  '- Distribution: signing-ready local artifact; not signed or notarized.',
  '',
  '## Automated gates',
  '',
  ...results.map(
    ({ durationMs, name, status }) =>
      `- ${status === 'passed' ? '✓' : '✗'} ${name} (${durationMs} ms)`,
  ),
  '',
  'Manual VoiceOver, physical iPhone PWA, Developer ID signing, notarization, Gatekeeper, and clean-device installation remain governed by `docs/testing/release-checklist.md`.',
  '',
].join('\n');
await writeFile(resolve(evidence, 'README.md'), summary);

if (failure) {
  console.error(`\nRelease verification failed at ${failure.name}.`);
  process.exitCode = 1;
} else {
  console.log(`\nRelease verification passed. Evidence: ${evidence}`);
}
