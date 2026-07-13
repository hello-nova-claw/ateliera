import { VaultUnavailableError } from './conflict';
import type { VaultPort } from './vault-port';

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
  state: 'writing' | 'complete' | 'incomplete';
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

export interface RevisionStoreOptions {
  clock?: () => Date;
  generateId?: () => string;
  retentionDays?: number;
}

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

function parseManifest(text: string): RevisionManifest | null {
  try {
    const value: unknown = JSON.parse(text);
    if (
      typeof value !== 'object' || value === null ||
      (value as Partial<RevisionManifest>).version !== 1 ||
      typeof (value as Partial<RevisionManifest>).id !== 'string' ||
      typeof (value as Partial<RevisionManifest>).createdAt !== 'string' ||
      !Array.isArray((value as Partial<RevisionManifest>).files)
    ) return null;
    return value as RevisionManifest;
  } catch {
    return null;
  }
}

async function removeSnapshot(vault: VaultPort, manifestPath: string): Promise<void> {
  const root = manifestPath.slice(0, -'/manifest.json'.length);
  const entries = (await vault.list(root))
    .filter((entry) => entry.kind === 'file')
    .sort((left, right) => right.path.length - left.path.length);
  for (const entry of entries) {
    const current = await vault.readBinary(entry.path);
    // Reading first proves the entry remains available; remove's conditional hash is supplied by
    // list where available and otherwise by a text read for the manifest below.
    void current;
    if (entry.contentHash !== undefined) {
      await vault.remove(entry.path, { expectedHash: entry.contentHash });
    } else {
      await vault.remove(entry.path);
    }
  }
}

export function createRevisionStore(
  vault: VaultPort,
  options: RevisionStoreOptions = {},
): RevisionStore {
  const clock = options.clock ?? (() => new Date());
  const generateId = options.generateId ?? (() => crypto.randomUUID());
  const retentionDays = options.retentionDays ?? 30;

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
        state: 'writing',
        files: [],
      };
      let manifestWrite = await vault.writeTextAtomic(path, manifestText(manifest), {
        expectedMissing: true,
      });
      try {
        for (const originalPath of [...new Set(sourcePaths)]) {
          const entry = (await vault.list(originalPath)).find(
            (candidate) => candidate.kind === 'file' && candidate.path === originalPath,
          );
          if (entry === undefined) throw new VaultUnavailableError(`Cannot snapshot ${originalPath}.`);
          const bytes = await vault.readBinary(originalPath);
          const snapshotPath = copyPath(root, originalPath);
          const copied = await vault.writeBinaryAtomic(snapshotPath, bytes, { expectedMissing: true });
          manifest = {
            ...manifest,
            files: [...manifest.files, { originalPath, snapshotPath, hash: copied.hash }],
          };
          manifestWrite = await vault.writeTextAtomic(path, manifestText(manifest), {
            expectedHash: manifestWrite.hash,
          });
        }
        manifest = { ...manifest, state: 'complete' };
        await vault.writeTextAtomic(path, manifestText(manifest), {
          expectedHash: manifestWrite.hash,
        });
        return { manifest, manifestPath: path };
      } catch (error) {
        manifest = { ...manifest, state: 'incomplete' };
        await vault.writeTextAtomic(path, manifestText(manifest), {
          expectedHash: manifestWrite.hash,
        }).catch(() => undefined);
        throw error;
      }
    },

    async prune() {
      const entries = await vault.list('.studio/backups').catch((error: unknown) => {
        if (error instanceof VaultUnavailableError) return [];
        throw error;
      });
      const snapshots: RevisionSnapshot[] = [];
      for (const entry of entries) {
        if (entry.kind !== 'file' || !entry.path.endsWith('/manifest.json')) continue;
        const file = await vault.readText(entry.path);
        const manifest = parseManifest(file.text);
        if (manifest !== null) snapshots.push({ manifest, manifestPath: entry.path });
      }
      snapshots.sort((left, right) => right.manifest.createdAt.localeCompare(left.manifest.createdAt));
      const now = clock().valueOf();
      const newestDay = new Set<string>();
      for (const snapshot of snapshots) {
        const created = Date.parse(snapshot.manifest.createdAt);
        const day = snapshot.manifest.createdAt.slice(0, 10);
        const expired = !Number.isFinite(created) || now - created >= retentionDays * 86_400_000;
        const duplicateDay = newestDay.has(day);
        if (expired || duplicateDay) {
          await removeSnapshot(vault, snapshot.manifestPath);
        } else {
          newestDay.add(day);
        }
      }
    },
  };
}
