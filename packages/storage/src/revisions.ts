import { VaultConflictError, VaultUnavailableError } from './conflict';
import type { VaultPort } from './vault-port';
import { createStudioControlVault } from './studio-control-vault';
import type { StudioControlVault } from './studio-control-vault';

export type RevisionReason =
  | 'migration'
  | 'multi-file-rename'
  | 'conflict-resolution';

export interface RevisionFile {
  originalPath: string;
  snapshotPath: string;
  hash: string;
}

export interface RevisionManifest {
  version: 1;
  id: string;
  reason: RevisionReason;
  createdAt: string;
  state: 'writing' | 'complete' | 'incomplete' | 'pruning';
  files: RevisionFile[];
}

export interface RevisionSnapshot {
  manifest: RevisionManifest;
  manifestPath: string;
}

export interface RevisionStore {
  create(reason: RevisionReason, paths: string[]): Promise<RevisionSnapshot>;
  prune(): Promise<void>;
}

export interface RevisionLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxManifestBytes: number;
}

export interface RevisionStoreOptions {
  clock?: () => Date;
  generateId?: () => string;
  retentionDays?: number;
  limits?: Partial<RevisionLimits>;
}

export class RevisionLimitError extends Error {
  readonly code = 'REVISION_LIMIT';

  constructor(readonly limit: keyof RevisionLimits) {
    super(`The revision snapshot exceeds its ${limit} safety limit.`);
    this.name = 'RevisionLimitError';
  }
}

const MEBIBYTE = 1_024 * 1_024;
const DEFAULT_LIMITS: RevisionLimits = {
  maxFiles: 9_999,
  maxFileBytes: 64 * MEBIBYTE,
  maxTotalBytes: 512 * MEBIBYTE,
  maxManifestBytes: 2 * MEBIBYTE,
};
const REASONS = new Set<RevisionReason>([
  'migration',
  'multi-file-rename',
  'conflict-resolution',
]);
const STATES = new Set<RevisionManifest['state']>([
  'writing',
  'complete',
  'incomplete',
  'pruning',
]);
const SHA256 = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();

function snapshotRoot(createdAt: string, id: string): string {
  const day = createdAt.slice(0, 10);
  const timestamp = createdAt.replaceAll(':', '-').replace('.', '-');
  return `.studio/backups/${day}/${timestamp}--${encodeURIComponent(id)}`;
}

function copyPath(root: string, path: string): string {
  return `${root}/files/${path}`;
}

function manifestText(manifest: RevisionManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeUserPath(path: string): boolean {
  if (path.length === 0 || path.includes('\0') || path.startsWith('/') || path.endsWith('/') ||
    path.includes('\\') || /^[A-Za-z]:/.test(path)) return false;
  return path.split('/').every((segment) => {
    const folded = segment.toLocaleLowerCase('en');
    return segment !== '' && segment !== '.' && segment !== '..' &&
      folded !== '.studio' && !folded.startsWith('.studio-');
  });
}

function isCanonicalTimestamp(value: string): boolean {
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function parseManifest(
  text: string,
  manifestPath: string,
  limits: RevisionLimits,
): RevisionManifest | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || value.version !== 1 || typeof value.id !== 'string' || value.id.length === 0 ||
      typeof value.reason !== 'string' || !REASONS.has(value.reason as RevisionReason) ||
      typeof value.createdAt !== 'string' || !isCanonicalTimestamp(value.createdAt) ||
      typeof value.state !== 'string' || !STATES.has(value.state as RevisionManifest['state']) ||
      !Array.isArray(value.files) || value.files.length > limits.maxFiles) return null;

    const root = snapshotRoot(value.createdAt, value.id);
    if (manifestPath !== `${root}/manifest.json`) return null;
    const originalPaths = new Set<string>();
    const snapshotPaths = new Set<string>();
    const files: RevisionFile[] = [];
    for (const candidate of value.files) {
      if (!isRecord(candidate) || typeof candidate.originalPath !== 'string' ||
        !isSafeUserPath(candidate.originalPath) || typeof candidate.snapshotPath !== 'string' ||
        candidate.snapshotPath !== copyPath(root, candidate.originalPath) ||
        typeof candidate.hash !== 'string' || !SHA256.test(candidate.hash) ||
        originalPaths.has(candidate.originalPath) || snapshotPaths.has(candidate.snapshotPath)) return null;
      originalPaths.add(candidate.originalPath);
      snapshotPaths.add(candidate.snapshotPath);
      files.push({
        originalPath: candidate.originalPath,
        snapshotPath: candidate.snapshotPath,
        hash: candidate.hash,
      });
    }

    return {
      version: 1,
      id: value.id,
      reason: value.reason as RevisionReason,
      createdAt: value.createdAt,
      state: value.state as RevisionManifest['state'],
      files,
    };
  } catch {
    return null;
  }
}

function normalizeLimits(overrides: Partial<RevisionLimits> | undefined): RevisionLimits {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits) as [keyof RevisionLimits, number][]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RevisionLimitError(name);
  }
  return limits;
}

function assertWithin(value: number, maximum: number, limit: keyof RevisionLimits): void {
  if (value > maximum) throw new RevisionLimitError(limit);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

interface ValidatedSnapshotFiles {
  files: Array<{ path: string; hash: string }>;
  expectedPaths: Set<string>;
}

async function validatedSnapshotFiles(
  control: StudioControlVault,
  manifest: RevisionManifest,
  limits: RevisionLimits,
  allowMissing: boolean,
): Promise<ValidatedSnapshotFiles | null> {
  const root = snapshotRoot(manifest.createdAt, manifest.id);
  const entries = (await control.list(root)).filter((entry) => entry.kind === 'file');
  const expectedPaths = new Set([
    `${root}/manifest.json`,
    ...manifest.files.map((file) => file.snapshotPath),
  ]);
  if (
    !entries.some((entry) => entry.path === `${root}/manifest.json`) ||
    entries.some((entry) => !expectedPaths.has(entry.path)) ||
    (!allowMissing && entries.length !== expectedPaths.size)
  ) {
    return null;
  }
  const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));
  let declaredTotalBytes = 0;
  for (const file of manifest.files) {
    const entry = entriesByPath.get(file.snapshotPath);
    if (entry === undefined) {
      if (allowMissing) continue;
      return null;
    }
    const size = entry.size;
    if (size === undefined) continue;
    if (!Number.isSafeInteger(size) || size < 0 || size > limits.maxFileBytes) return null;
    declaredTotalBytes += size;
    if (!Number.isSafeInteger(declaredTotalBytes) || declaredTotalBytes > limits.maxTotalBytes) {
      return null;
    }
  }
  let totalBytes = 0;
  const files: Array<{ path: string; hash: string }> = [];
  for (const file of manifest.files) {
    const entry = entriesByPath.get(file.snapshotPath);
    if (entry === undefined) {
      if (allowMissing) continue;
      return null;
    }
    const bytes = await control.readBinary(file.snapshotPath);
    const size = bytes.byteLength;
    if (size > limits.maxFileBytes) return null;
    totalBytes += size;
    if (totalBytes > limits.maxTotalBytes) return null;
    const hash = await sha256(bytes);
    if (hash !== file.hash) return null;
    files.push({ path: file.snapshotPath, hash });
  }
  return { files, expectedPaths };
}

async function removeSnapshot(
  vault: StudioControlVault,
  manifestPath: string,
  manifestHash: string,
  validated: ValidatedSnapshotFiles,
): Promise<void> {
  const root = manifestPath.slice(0, -'/manifest.json'.length);
  const assertNoUnexpectedFiles = async (): Promise<void> => {
    const entries = (await vault.list(root)).filter((entry) => entry.kind === 'file');
    if (entries.some((entry) => !validated.expectedPaths.has(entry.path))) {
      throw new VaultConflictError('Snapshot changed after retention validation.');
    }
  };
  await assertNoUnexpectedFiles();
  const files = [...validated.files].sort((left, right) =>
    right.path.length - left.path.length || left.path.localeCompare(right.path, 'en'));
  for (const file of files) {
    await vault.remove(file.path, { expectedHash: file.hash });
  }
  await assertNoUnexpectedFiles();
  await vault.remove(manifestPath, { expectedHash: manifestHash });
}

interface PlannedSource {
  originalPath: string;
  snapshotPath: string;
}

async function planSnapshot(
  vault: VaultPort,
  root: string,
  sourcePaths: string[],
  baseManifest: RevisionManifest,
  limits: RevisionLimits,
): Promise<PlannedSource[]> {
  const paths = [...new Set(sourcePaths)];
  assertWithin(paths.length, limits.maxFiles, 'maxFiles');
  const planned: PlannedSource[] = [];
  let totalBytes = 0;
  for (const originalPath of paths) {
    const entry = (await vault.list(originalPath)).find(
      (candidate) => candidate.kind === 'file' && candidate.path === originalPath,
    );
    if (entry === undefined) throw new VaultUnavailableError(`Cannot snapshot ${originalPath}.`);
    const size = entry.size ?? (await vault.readBinary(originalPath)).byteLength;
    assertWithin(size, limits.maxFileBytes, 'maxFileBytes');
    totalBytes += size;
    assertWithin(totalBytes, limits.maxTotalBytes, 'maxTotalBytes');
    planned.push({ originalPath, snapshotPath: copyPath(root, originalPath) });
  }

  const largestManifest: RevisionManifest = {
    ...baseManifest,
    files: planned.map((source) => ({
      originalPath: source.originalPath,
      snapshotPath: source.snapshotPath,
      hash: '0'.repeat(64),
    })),
  };
  assertWithin(
    encoder.encode(manifestText(largestManifest)).byteLength,
    limits.maxManifestBytes,
    'maxManifestBytes',
  );
  return planned;
}

export function createRevisionStore(
  vault: VaultPort,
  options: RevisionStoreOptions = {},
): RevisionStore {
  const clock = options.clock ?? (() => new Date());
  const generateId = options.generateId ?? (() => crypto.randomUUID());
  const retentionDays = options.retentionDays ?? 30;
  const limits = normalizeLimits(options.limits);
  const control = createStudioControlVault(vault);

  const prune = async (): Promise<void> => {
    const entries = await control.list('.studio/backups').catch((error: unknown) => {
      if (error instanceof VaultUnavailableError) return [];
      throw error;
    });
    const snapshots: Array<RevisionSnapshot & {
      manifestHash: string;
      validated: ValidatedSnapshotFiles;
    }> = [];
    const pruning: Array<RevisionSnapshot & {
      manifestHash: string;
      validated: ValidatedSnapshotFiles;
    }> = [];
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.path.endsWith('/manifest.json') ||
        (entry.size !== undefined && entry.size > limits.maxManifestBytes)) continue;
      try {
        const file = await control.readText(entry.path);
        if (encoder.encode(file.text).byteLength > limits.maxManifestBytes) continue;
        const manifest = parseManifest(file.text, entry.path, limits);
        if (manifest?.state === 'pruning') {
          const validated = await validatedSnapshotFiles(control, manifest, limits, true);
          if (validated !== null) {
            pruning.push({
              manifest,
              manifestPath: entry.path,
              manifestHash: file.hash,
              validated,
            });
          }
        } else if (manifest?.state === 'complete') {
          const validated = await validatedSnapshotFiles(control, manifest, limits, false);
          if (validated !== null) {
            snapshots.push({
              manifest,
              manifestPath: entry.path,
              manifestHash: file.hash,
              validated,
            });
          }
        }
      } catch {
        // A malformed, missing, or temporarily unreadable snapshot cannot displace a verified copy.
      }
    }

    pruning.sort((left, right) => left.manifestPath.localeCompare(right.manifestPath, 'en'));
    for (const snapshot of pruning) {
      await removeSnapshot(
        control,
        snapshot.manifestPath,
        snapshot.manifestHash,
        snapshot.validated,
      );
    }

    snapshots.sort((left, right) =>
      right.manifest.createdAt.localeCompare(left.manifest.createdAt) ||
      left.manifestPath.localeCompare(right.manifestPath, 'en'));
    const now = clock().valueOf();
    const newestDay = new Set<string>();
    for (const snapshot of snapshots) {
      const created = Date.parse(snapshot.manifest.createdAt);
      const day = snapshot.manifest.createdAt.slice(0, 10);
      const expired = now - created >= retentionDays * 86_400_000;
      const duplicateDay = newestDay.has(day);
      if (expired || duplicateDay) {
        const pruningManifest: RevisionManifest = { ...snapshot.manifest, state: 'pruning' };
        const pruningWrite = await control.writeTextAtomic(
          snapshot.manifestPath,
          manifestText(pruningManifest), {
          expectedHash: snapshot.manifestHash,
          });
        await removeSnapshot(
          control,
          snapshot.manifestPath,
          pruningWrite.hash,
          snapshot.validated,
        );
      } else {
        newestDay.add(day);
      }
    }
  };

  return {
    async create(reason, sourcePaths) {
      const createdAt = clock().toISOString();
      const id = generateId();
      const root = snapshotRoot(createdAt, id);
      const path = `${root}/manifest.json`;
      let manifest: RevisionManifest = {
        version: 1,
        id,
        reason,
        createdAt,
        state: 'incomplete',
        files: [],
      };
      const planned = await planSnapshot(vault, root, sourcePaths, manifest, limits);
      let manifestWrite = await control.writeTextAtomic(path, manifestText(manifest), {
        expectedMissing: true,
      });
      let copiedBytes = 0;
      for (const source of planned) {
        const bytes = await vault.readBinary(source.originalPath);
        assertWithin(bytes.byteLength, limits.maxFileBytes, 'maxFileBytes');
        copiedBytes += bytes.byteLength;
        assertWithin(copiedBytes, limits.maxTotalBytes, 'maxTotalBytes');
        const copied = await control.writeBinaryAtomic(source.snapshotPath, bytes, { expectedMissing: true });
        manifest = {
          ...manifest,
          files: [...manifest.files, {
            originalPath: source.originalPath,
            snapshotPath: source.snapshotPath,
            hash: copied.hash,
          }],
        };
        manifestWrite = await control.writeTextAtomic(path, manifestText(manifest), {
          expectedHash: manifestWrite.hash,
        });
      }
      manifest = { ...manifest, state: 'complete' };
      await control.writeTextAtomic(path, manifestText(manifest), {
        expectedHash: manifestWrite.hash,
      });
      // Retention cleanup is conservative and must never turn a completed safety snapshot into
      // a failed operation. A later create or explicit prune will retry unavailable cleanup.
      await prune().catch(() => undefined);
      return { manifest, manifestPath: path };
    },

    prune,
  };
}
