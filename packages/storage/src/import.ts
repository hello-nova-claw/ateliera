import { VaultConflictError, VaultUnavailableError } from './conflict';
import { ZIP32_LIMITS, Zip32Error, parseZip32, sha256 } from './zip32';
import {
  PORTABLE_MANIFEST_PATH,
  PortableVaultError,
  assertNoActiveContent,
  exportDisposition,
  portablePathKey,
  validPortableManifest,
  validatePortablePath,
} from './portability';
import type { PortableVaultManifest } from './portability';
import type { VaultPort } from './vault-port';

export type VaultImportAction = 'create' | 'overwrite' | 'conflict' | 'skip';

export interface VaultImportItem {
  action: VaultImportAction;
  path: string;
  size: number;
  sha256: string;
  expectedHash?: string;
  /** Existing canonical path when the collision is not at the incoming path. */
  existingPath?: string;
  conflictKind?: 'note-id' | 'portable-path';
  incomingNoteId?: string;
  existingNoteId?: string;
}

export interface VaultImportPlan {
  id: string;
  archiveHash: string;
  manifest: PortableVaultManifest;
  items: readonly VaultImportItem[];
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export interface ApplyVaultImportOptions {
  confirm: boolean;
  conflicts?: Readonly<Record<string, 'overwrite' | 'skip'>>;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

function translateArchiveError(error: unknown): never {
  if (error instanceof PortableVaultError) throw error;
  if (error instanceof Zip32Error) {
    throw new PortableVaultError(error.code, error.message);
  }
  throw error;
}

function extractNoteId(path: string, bytes: Uint8Array): string | undefined {
  if (!path.toLocaleLowerCase('en').endsWith('.md')) return undefined;
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    return undefined;
  }
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return undefined;
  const end = text.indexOf('\n---', 4);
  if (end < 0) return undefined;
  const match = /^id:\s*['"]?([^\s'"#]+)['"]?\s*(?:#.*)?$/m.exec(text.slice(0, end));
  return match?.[1];
}

async function sourceBytes(source: Blob | Uint8Array): Promise<Uint8Array> {
  const limit = ZIP32_LIMITS.maxArchiveBytes;
  if (source instanceof Blob) {
    if (source.size > limit) {
      throw new PortableVaultError('archive-too-large', 'The ZIP archive exceeds 512 MiB.');
    }
    return new Uint8Array(await source.arrayBuffer());
  }
  if (source.byteLength > limit) {
    throw new PortableVaultError('archive-too-large', 'The ZIP archive exceeds 512 MiB.');
  }
  return source.slice();
}

function assertManifestOrder(manifest: PortableVaultManifest): void {
  const paths = manifest.files.map((file) => file.path);
  const sorted = [...paths].sort((left, right) => left.localeCompare(right, 'en'));
  if (paths.some((path, index) => path !== sorted[index])) {
    throw new PortableVaultError('invalid-manifest', 'The manifest file list is not deterministic.');
  }
  const excluded = [...manifest.excludedCaches].sort((left, right) => left.localeCompare(right, 'en'));
  if (manifest.excludedCaches.some((path, index) => path !== excluded[index])) {
    throw new PortableVaultError('invalid-manifest', 'The excluded-cache list is not deterministic.');
  }
}

export async function prepareVaultImport(
  vault: VaultPort,
  source: Blob | Uint8Array,
): Promise<VaultImportPlan> {
  const bytes = await sourceBytes(source);
  let archiveFiles: Map<string, Uint8Array>;
  try {
    archiveFiles = await parseZip32(bytes);
  } catch (error) {
    translateArchiveError(error);
  }
  const manifestBytes = archiveFiles.get(PORTABLE_MANIFEST_PATH);
  if (manifestBytes === undefined) {
    throw new PortableVaultError('invalid-manifest', 'The Studio export manifest is missing.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(manifestBytes));
  } catch {
    throw new PortableVaultError('invalid-manifest', 'The Studio export manifest is invalid.');
  }
  if (!validPortableManifest(parsed)) {
    throw new PortableVaultError('invalid-manifest', 'The Studio export schema is unsupported.');
  }
  const manifest = parsed;
  assertManifestOrder(manifest);
  if (manifest.files.length > ZIP32_LIMITS.maxEntryCount - 1) {
    throw new PortableVaultError('archive-too-large', 'The archive contains more than 9,999 user files.');
  }

  const seen = new Set<string>();
  const excludedSeen = new Set<string>();
  const incomingNoteIds = new Set<string>();
  const validated = new Map<string, Uint8Array>();
  let totalSize = manifestBytes.byteLength;
  for (const descriptor of manifest.files) {
    const path = validatePortablePath(descriptor.path);
    assertNoActiveContent(path);
    if (path === PORTABLE_MANIFEST_PATH || exportDisposition(path) !== 'include') {
      throw new PortableVaultError('invalid-path', `The manifest includes a reserved path: ${path}.`);
    }
    const key = portablePathKey(path);
    if (seen.has(key)) {
      throw new PortableVaultError('path-collision', `Archive paths collide after normalization: ${path}.`);
    }
    seen.add(key);
    if (descriptor.size > ZIP32_LIMITS.maxEntryBytes) {
      throw new PortableVaultError('archive-too-large', `The file exceeds 64 MiB: ${path}.`);
    }
    totalSize += descriptor.size;
    if (totalSize > ZIP32_LIMITS.maxTotalBytes) {
      throw new PortableVaultError('archive-too-large', 'The expanded archive exceeds 512 MiB.');
    }
    const content = archiveFiles.get(path);
    if (content === undefined || content.byteLength !== descriptor.size ||
      await sha256(content) !== descriptor.sha256) {
      throw new PortableVaultError('checksum-failed', `Checksum validation failed for ${path}.`);
    }
    validated.set(path, content.slice());
    const noteId = extractNoteId(path, content);
    if (noteId !== undefined) {
      if (incomingNoteIds.has(noteId)) {
        throw new PortableVaultError('invalid-manifest', `The archive contains duplicate note ID ${noteId}.`);
      }
      incomingNoteIds.add(noteId);
    }
  }
  if (archiveFiles.size !== validated.size + 1) {
    throw new PortableVaultError('invalid-manifest', 'The ZIP contains files outside its manifest.');
  }
  for (const path of manifest.excludedCaches) {
    validatePortablePath(path);
    if (exportDisposition(path) !== 'cache') {
      throw new PortableVaultError('invalid-manifest', 'The manifest excluded-cache list is invalid.');
    }
    const key = portablePathKey(path);
    if (excludedSeen.has(key) || seen.has(key)) {
      throw new PortableVaultError('path-collision', 'The manifest contains colliding cache paths.');
    }
    excludedSeen.add(key);
  }

  const targetFiles = (await vault.list()).filter((entry) => entry.kind === 'file');
  const targetByPortablePath = new Map<string, { path: string; hash: string; bytes: Uint8Array }>();
  const targetByNoteId = new Map<string, { path: string; hash: string; bytes: Uint8Array }>();
  for (const entry of targetFiles) {
    if (exportDisposition(entry.path) !== 'include') continue;
    let path: string;
    try {
      path = validatePortablePath(entry.path.normalize('NFC'));
    } catch {
      continue;
    }
    const bytes = await vault.readBinary(entry.path);
    const hash = await sha256(bytes);
    const key = portablePathKey(path);
    if (targetByPortablePath.has(key)) {
      throw new PortableVaultError('path-collision', 'The target contains case- or Unicode-colliding paths.');
    }
    const target = { path: entry.path, hash, bytes };
    targetByPortablePath.set(key, target);
    const noteId = extractNoteId(entry.path, bytes);
    if (noteId !== undefined) {
      const previous = targetByNoteId.get(noteId);
      if (previous !== undefined && previous.path !== entry.path) {
        throw new PortableVaultError('path-collision', `The target contains duplicate note ID ${noteId}.`);
      }
      targetByNoteId.set(noteId, target);
    }
  }

  const items: VaultImportItem[] = [];
  for (const descriptor of manifest.files) {
    const incoming = validated.get(descriptor.path) as Uint8Array;
    const incomingNoteId = extractNoteId(descriptor.path, incoming);
    const pathTarget = targetByPortablePath.get(portablePathKey(descriptor.path));
    const idTarget = incomingNoteId === undefined ? undefined : targetByNoteId.get(incomingNoteId);
    const existing = pathTarget ?? idTarget;
    if (existing === undefined) {
      items.push({ action: 'create', ...descriptor });
      continue;
    }
    if (existing.hash === descriptor.sha256 && existing.path === descriptor.path) {
      items.push({ action: 'skip', ...descriptor, expectedHash: existing.hash });
      continue;
    }
    const existingNoteId = extractNoteId(existing.path, existing.bytes);
    const portablePathConflict = existing.path !== descriptor.path;
    const noteIdConflict = pathTarget !== undefined && incomingNoteId !== undefined &&
      existingNoteId !== undefined && incomingNoteId !== existingNoteId;
    const action = portablePathConflict || noteIdConflict ? 'conflict' : 'overwrite';
    items.push({
      action,
      ...descriptor,
      expectedHash: existing.hash,
      ...(existing.path === descriptor.path ? {} : { existingPath: existing.path }),
      ...(portablePathConflict
        ? { conflictKind: idTarget === existing ? 'note-id' as const : 'portable-path' as const }
        : noteIdConflict ? { conflictKind: 'note-id' as const } : {}),
      ...(incomingNoteId === undefined ? {} : { incomingNoteId }),
      ...(existingNoteId === undefined ? {} : { existingNoteId }),
    });
  }

  return {
    id: crypto.randomUUID(),
    archiveHash: await sha256(bytes),
    manifest,
    items,
    files: validated,
  };
}

function resolvedAction(
  item: VaultImportItem,
  options: ApplyVaultImportOptions,
): Exclude<VaultImportAction, 'conflict'> {
  if (item.action !== 'conflict') return item.action;
  const resolution = options.conflicts?.[item.path];
  if (resolution === undefined) {
    throw new PortableVaultError('unresolved-conflict', `Choose how to resolve ${item.path}.`);
  }
  return resolution;
}

export async function applyVaultImport(
  vault: VaultPort,
  plan: VaultImportPlan,
  options: ApplyVaultImportOptions,
): Promise<{ created: number; overwritten: number; skipped: number }> {
  if (!options.confirm) {
    throw new PortableVaultError('confirmation-required', 'Import confirmation is required.');
  }
  const actions = plan.items.map((item) => ({ item, action: resolvedAction(item, options) }));

  for (const { item } of actions) {
    const targetPath = item.existingPath ?? item.path;
    const exists = await vault.exists(targetPath);
    if (item.action === 'create') {
      if (exists) throw new PortableVaultError('target-changed', `The import target changed: ${item.path}.`);
      continue;
    }
    if (!exists || await sha256(await vault.readBinary(targetPath)) !== item.expectedHash) {
      throw new PortableVaultError('target-changed', `The import target changed: ${item.path}.`);
    }
  }

  const mutating = actions.filter(({ action }) => action === 'create' || action === 'overwrite');
  const stageRoot = `.studio/import-stage/${plan.id}`;
  const backupRoot = `.studio/import-backup/${plan.id}`;
  const cleanupPaths: string[] = [];
  const backups = new Map<string, Uint8Array>();
  const applied: Array<{ item: VaultImportItem; publishedHash: string }> = [];
  const cleanup = async () => {
    for (const path of [...cleanupPaths].reverse()) {
      try {
        if (await vault.exists(path)) await vault.remove(path);
      } catch {
        // A failed cleanup is disposable and excluded from future exports.
      }
    }
  };

  try {
    for (const { item, action } of mutating) {
      const content = plan.files.get(item.path);
      if (content === undefined || await sha256(content) !== item.sha256) {
        throw new PortableVaultError('checksum-failed', `Import plan checksum failed for ${item.path}.`);
      }
      const stagePath = `${stageRoot}/${item.path}`;
      await vault.writeBinaryAtomic(stagePath, content, { expectedMissing: true });
      cleanupPaths.push(stagePath);
      if (action === 'overwrite') {
        const targetPath = item.existingPath ?? item.path;
        const previous = await vault.readBinary(targetPath);
        backups.set(targetPath, previous);
        const backupPath = `${backupRoot}/${item.path}`;
        await vault.writeBinaryAtomic(backupPath, previous, { expectedMissing: true });
        cleanupPaths.push(backupPath);
      }
    }
    for (const { item, action } of mutating) {
      const targetPath = action === 'overwrite' ? item.existingPath ?? item.path : item.path;
      const result = await vault.writeBinaryAtomic(
        targetPath,
        await vault.readBinary(`${stageRoot}/${item.path}`),
        action === 'create'
          ? { expectedMissing: true }
          : { expectedHash: item.expectedHash as string },
      );
      applied.push({ item: { ...item, existingPath: targetPath }, publishedHash: result.hash });
    }
  } catch (error) {
    for (const { item, publishedHash } of [...applied].reverse()) {
      const targetPath = item.existingPath ?? item.path;
      const prior = backups.get(targetPath);
      try {
        if (prior === undefined) {
          await vault.remove(targetPath, { expectedHash: publishedHash });
        } else {
          await vault.writeBinaryAtomic(targetPath, prior, { expectedHash: publishedHash });
        }
      } catch {
        throw new VaultUnavailableError(
          `Import failed and rollback could not restore ${targetPath}. Backups remain in ${backupRoot}.`,
        );
      }
    }
    await cleanup();
    if (error instanceof VaultConflictError) {
      throw new PortableVaultError('target-changed', 'The target changed while the import was being applied.');
    }
    throw error;
  }
  await cleanup();
  return {
    created: actions.filter(({ action }) => action === 'create').length,
    overwritten: actions.filter(({ action }) => action === 'overwrite').length,
    skipped: actions.filter(({ action }) => action === 'skip').length,
  };
}

export async function importVault(
  vault: VaultPort,
  source: Blob | Uint8Array,
  options: ApplyVaultImportOptions,
): Promise<{ created: number; overwritten: number; skipped: number }> {
  return applyVaultImport(vault, await prepareVaultImport(vault, source), options);
}
