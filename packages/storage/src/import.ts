import { VaultConflictError } from './conflict';
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
import { isPublicNotePath } from './vault-port';
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
  readonly targetFingerprint: readonly TargetFingerprintEntry[];
  readonly targetRevision: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export interface TargetFingerprintEntry {
  path: string;
  portablePath: string;
  sha256: string;
  noteId?: string;
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
  if (!isPublicNotePath(path)) return undefined;
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

interface IncludedTargetScan {
  byPortablePath: Map<string, ScannedTarget>;
  byNoteId: Map<string, ScannedTarget>;
  fingerprint: TargetFingerprintEntry[];
  revision: string;
}

interface ScannedTarget {
  path: string;
  hash: string;
  noteId?: string;
}

async function scanIncludedTarget(vault: VaultPort): Promise<IncludedTargetScan> {
  const revision = await vault.getRevision();
  const targetFiles = (await vault.list()).filter((entry) => entry.kind === 'file');
  const byPortablePath = new Map<string, ScannedTarget>();
  const byNoteId = new Map<string, ScannedTarget>();
  const fingerprint: TargetFingerprintEntry[] = [];
  for (const entry of targetFiles) {
    if (exportDisposition(entry.path) !== 'include') continue;
    let path: string;
    try {
      path = validatePortablePath(entry.path.normalize('NFC'));
    } catch {
      continue;
    }
    if (!Number.isSafeInteger(entry.size) || (entry.size as number) < 0 ||
      typeof entry.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.contentHash)) {
      throw new PortableVaultError('target-changed', `Target metadata is incomplete for ${entry.path}.`);
    }
    const hash = entry.contentHash;
    let noteId: string | undefined;
    if (isPublicNotePath(entry.path)) {
      if ((entry.size as number) > ZIP32_LIMITS.maxEntryBytes) {
        throw new PortableVaultError('archive-too-large', `The target note exceeds 64 MiB: ${entry.path}.`);
      }
      const bytes = await vault.readBinary(entry.path);
      if (bytes.byteLength > ZIP32_LIMITS.maxEntryBytes || bytes.byteLength !== entry.size ||
        await sha256(bytes) !== hash) {
        throw new PortableVaultError('target-changed', `The target changed while reading ${entry.path}.`);
      }
      noteId = extractNoteId(entry.path, bytes);
    }
    const key = portablePathKey(path);
    if (byPortablePath.has(key)) {
      throw new PortableVaultError('path-collision', 'The target contains case- or Unicode-colliding paths.');
    }
    const target: ScannedTarget = {
      path: entry.path,
      hash,
      ...(noteId === undefined ? {} : { noteId }),
    };
    byPortablePath.set(key, target);
    if (noteId !== undefined) {
      const previous = byNoteId.get(noteId);
      if (previous !== undefined && previous.path !== entry.path) {
        throw new PortableVaultError('path-collision', `The target contains duplicate note ID ${noteId}.`);
      }
      byNoteId.set(noteId, target);
    }
    fingerprint.push({
      path: entry.path,
      portablePath: key,
      sha256: hash,
      ...(noteId === undefined ? {} : { noteId }),
    });
  }
  fingerprint.sort((left, right) =>
    left.portablePath.localeCompare(right.portablePath, 'en') ||
    left.path.localeCompare(right.path, 'en'));
  if (await vault.getRevision() !== revision) {
    throw new PortableVaultError('target-changed', 'The import target changed while it was being read.');
  }
  return { byPortablePath, byNoteId, fingerprint, revision };
}

function sameTargetFingerprint(
  left: readonly TargetFingerprintEntry[],
  right: readonly TargetFingerprintEntry[],
): boolean {
  return left.length === right.length && left.every((entry, index) => {
    const candidate = right[index];
    return candidate !== undefined && entry.path === candidate.path &&
      entry.portablePath === candidate.portablePath && entry.sha256 === candidate.sha256 &&
      entry.noteId === candidate.noteId;
  });
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

  const target = await scanIncludedTarget(vault);

  const items: VaultImportItem[] = [];
  const claimedTargets = new Map<string, string>();
  for (const descriptor of manifest.files) {
    const incoming = validated.get(descriptor.path) as Uint8Array;
    const incomingNoteId = extractNoteId(descriptor.path, incoming);
    const pathTarget = target.byPortablePath.get(portablePathKey(descriptor.path));
    const idTarget = incomingNoteId === undefined ? undefined : target.byNoteId.get(incomingNoteId);
    if (pathTarget !== undefined && idTarget !== undefined && pathTarget.path !== idTarget.path) {
      throw new PortableVaultError(
        'path-collision',
        `The incoming path and stable note ID belong to different target files: ${descriptor.path}.`,
      );
    }
    const existing = pathTarget ?? idTarget;
    if (existing === undefined) {
      items.push({ action: 'create', ...descriptor });
      continue;
    }
    const previousClaim = claimedTargets.get(existing.path);
    if (previousClaim !== undefined && previousClaim !== descriptor.path) {
      throw new PortableVaultError(
        'path-collision',
        `Multiple incoming files would replace the same target: ${existing.path}.`,
      );
    }
    claimedTargets.set(existing.path, descriptor.path);
    if (existing.hash === descriptor.sha256 && existing.path === descriptor.path) {
      items.push({ action: 'skip', ...descriptor, expectedHash: existing.hash });
      continue;
    }
    const existingNoteId = existing.noteId;
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
    targetFingerprint: target.fingerprint,
    targetRevision: target.revision,
    files: validated,
  };
}

function resolvedAction(
  item: VaultImportItem,
  options: ApplyVaultImportOptions,
): Exclude<VaultImportAction, 'conflict'> {
  if (item.action !== 'conflict') return item.action;
  if (
    options.conflicts === undefined ||
    !Object.prototype.hasOwnProperty.call(options.conflicts, item.path)
  ) {
    throw new PortableVaultError('unresolved-conflict', `Choose how to resolve ${item.path}.`);
  }
  const resolution: unknown = options.conflicts[item.path];
  if (resolution !== 'overwrite' && resolution !== 'skip') {
    throw new PortableVaultError('unresolved-conflict', `Choose how to resolve ${item.path}.`);
  }
  return resolution;
}

function assertUniquePublishedNoteIds(
  fingerprint: readonly TargetFingerprintEntry[],
  actions: ReadonlyArray<{
    item: VaultImportItem;
    action: Exclude<VaultImportAction, 'conflict'>;
  }>,
  files: ReadonlyMap<string, Uint8Array>,
): void {
  const noteIdByPath = new Map(
    fingerprint
      .filter((entry): entry is TargetFingerprintEntry & { noteId: string } =>
        entry.noteId !== undefined)
      .map((entry) => [entry.path, entry.noteId] as const),
  );
  const publicationPaths = new Set<string>();
  for (const { item, action } of actions) {
    if (action !== 'create' && action !== 'overwrite') continue;
    const targetPath = action === 'overwrite' ? item.existingPath ?? item.path : item.path;
    if (publicationPaths.has(targetPath)) {
      throw new PortableVaultError(
        'path-collision',
        `Multiple imported files would publish to ${targetPath}.`,
      );
    }
    publicationPaths.add(targetPath);
    noteIdByPath.delete(targetPath);
    const content = files.get(item.path);
    if (content === undefined) {
      throw new PortableVaultError('checksum-failed', `Import plan checksum failed for ${item.path}.`);
    }
    const incomingNoteId = extractNoteId(item.path, content);
    if (incomingNoteId !== undefined) noteIdByPath.set(targetPath, incomingNoteId);
  }

  const ownerByNoteId = new Map<string, string>();
  for (const [path, noteId] of noteIdByPath) {
    const owner = ownerByNoteId.get(noteId);
    if (owner !== undefined && owner !== path) {
      throw new PortableVaultError(
        'path-collision',
        `The import would create duplicate note ID ${noteId}.`,
      );
    }
    ownerByNoteId.set(noteId, path);
  }
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

  let currentTarget: IncludedTargetScan;
  try {
    currentTarget = await scanIncludedTarget(vault);
  } catch {
    throw new PortableVaultError('target-changed', 'The import target changed after preview.');
  }
  if (
    plan.targetRevision !== currentTarget.revision ||
    !sameTargetFingerprint(plan.targetFingerprint, currentTarget.fingerprint)
  ) {
    throw new PortableVaultError('target-changed', 'The import target changed after preview.');
  }
  assertUniquePublishedNoteIds(currentTarget.fingerprint, actions, plan.files);

  const mutating = actions.filter(({ action }) => action === 'create' || action === 'overwrite');
  const writes = [] as Array<{
    path: string;
    bytes: Uint8Array;
    expectedHash?: string;
    expectedMissing?: true;
  }>;
  for (const { item, action } of mutating) {
    const content = plan.files.get(item.path);
    if (content === undefined || await sha256(content) !== item.sha256) {
      throw new PortableVaultError('checksum-failed', `Import plan checksum failed for ${item.path}.`);
    }
    const path = action === 'overwrite' ? item.existingPath ?? item.path : item.path;
    writes.push(action === 'create'
      ? { path, bytes: content, expectedMissing: true }
      : { path, bytes: content, expectedHash: item.expectedHash as string });
  }
  try {
    if (writes.length > 0) {
      await vault.writeBatchAtomic({ expectedRevision: currentTarget.revision, writes });
    }
  } catch (error) {
    if (error instanceof VaultConflictError) {
      throw new PortableVaultError('target-changed', 'The target changed while the import was being applied.');
    }
    throw error;
  }
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
