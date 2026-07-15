import { ZIP32_LIMITS, Zip32Error, createZip32, sha256 } from './zip32';
import {
  PORTABLE_EXPORT_VERSION,
  PORTABLE_FORMAT,
  PORTABLE_MANIFEST_PATH,
  PORTABLE_MAX_USER_FILES,
  PORTABLE_NOTE_SCHEMA_VERSION,
  PORTABLE_SETTINGS_SCHEMA_VERSION,
  PortableVaultError,
  assertNoActiveContent,
  exportDisposition,
  portablePathKey,
  validatePortablePath,
} from './portability';
import type { PortableVaultManifest } from './portability';
import type { VaultPort } from './vault-port';

export { PortableVaultError } from './portability';
export type { PortableVaultErrorCode, PortableVaultManifest } from './portability';

export interface ExportVaultOptions {
  generatedAt?: string;
}

const encoder = new TextEncoder();

function validateGeneratedAt(value: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new PortableVaultError('invalid-manifest', 'The export time must be a valid ISO timestamp.');
  }
  return new Date(value).toISOString();
}

interface CapturedExportEntry {
  sourcePath: string;
  path: string;
  sha256: string;
  size: number;
}

function sourceChanged(): PortableVaultError {
  return new PortableVaultError(
    'source-changed',
    'Ateliera changed while the backup was being created. Nothing was exported; try again.',
  );
}

async function readPortableSource(vault: VaultPort, path: string): Promise<Uint8Array> {
  if (vault.readBinaryBounded !== undefined) {
    return (await vault.readBinaryBounded(path, ZIP32_LIMITS.maxEntryBytes)).bytes;
  }
  return vault.readBinary(path);
}

async function assertSourceUnchanged(
  vault: VaultPort,
  captured: readonly CapturedExportEntry[],
  capturedExcludedCaches: readonly string[],
): Promise<void> {
  try {
    const entries = (await vault.list()).filter((entry) => entry.kind === 'file');
    const included: Array<{ sourcePath: string; path: string }> = [];
    const excludedCaches: string[] = [];
    const includedKeys = new Set<string>();
    const excludedKeys = new Set<string>();

    for (const entry of entries) {
      const disposition = exportDisposition(entry.path);
      if (disposition === 'internal') continue;
      const path = validatePortablePath(entry.path.normalize('NFC'));
      const key = portablePathKey(path);
      if (disposition === 'cache') {
        if (excludedKeys.has(key)) throw sourceChanged();
        excludedKeys.add(key);
        if (excludedCaches.length >= PORTABLE_MAX_USER_FILES) {
          throw new PortableVaultError(
            'archive-too-large',
            `Portable exports support at most ${PORTABLE_MAX_USER_FILES} excluded cache paths.`,
          );
        }
        excludedCaches.push(path);
        continue;
      }
      assertNoActiveContent(path);
      if (path === PORTABLE_MANIFEST_PATH || includedKeys.has(key)) throw sourceChanged();
      includedKeys.add(key);
      included.push({ sourcePath: entry.path, path });
    }

    included.sort((left, right) => left.path.localeCompare(right.path, 'en'));
    excludedCaches.sort((left, right) => left.localeCompare(right, 'en'));
    if (
      included.length !== captured.length ||
      included.some((entry, index) => {
        const prior = captured[index];
        return prior === undefined || entry.path !== prior.path || entry.sourcePath !== prior.sourcePath;
      }) ||
      excludedCaches.length !== capturedExcludedCaches.length ||
      excludedCaches.some((path, index) => path !== capturedExcludedCaches[index])
    ) {
      throw sourceChanged();
    }

    for (const [index, entry] of included.entries()) {
      const prior = captured[index] as CapturedExportEntry;
      const bytes = await readPortableSource(vault, entry.sourcePath);
      if (bytes.byteLength !== prior.size || await sha256(bytes) !== prior.sha256) {
        throw sourceChanged();
      }
    }
  } catch (error) {
    if (error instanceof PortableVaultError && error.code === 'source-changed') throw error;
    throw sourceChanged();
  }
}

export async function exportVault(
  vault: VaultPort,
  options: ExportVaultOptions = {},
): Promise<Uint8Array> {
  const sourceRevision = await vault.getRevision();
  const entries = (await vault.list()).filter((entry) => entry.kind === 'file');
  const included: Array<{ sourcePath: string; path: string; declaredSize?: number }> = [];
  const excludedCaches: string[] = [];
  const pathKeys = new Set<string>();
  const excludedKeys = new Set<string>();

  for (const entry of entries) {
    const disposition = exportDisposition(entry.path);
    if (disposition !== 'include') {
      if (disposition === 'cache') {
        const path = validatePortablePath(entry.path.normalize('NFC'));
        const key = portablePathKey(path);
        if (excludedKeys.has(key)) {
          throw new PortableVaultError('path-collision', `Excluded cache paths collide: ${path}.`);
        }
        excludedKeys.add(key);
        if (excludedCaches.length >= PORTABLE_MAX_USER_FILES) {
          throw new PortableVaultError(
            'archive-too-large',
            `Portable exports support at most ${PORTABLE_MAX_USER_FILES} excluded cache paths.`,
          );
        }
        excludedCaches.push(path);
      }
      continue;
    }
    const path = validatePortablePath(entry.path.normalize('NFC'));
    assertNoActiveContent(path);
    if (path === PORTABLE_MANIFEST_PATH) {
      throw new PortableVaultError('invalid-path', 'The manifest path is reserved for the archive.');
    }
    const key = portablePathKey(path);
    if (pathKeys.has(key)) {
      throw new PortableVaultError('path-collision', `Portable paths collide after normalization: ${path}.`);
    }
    pathKeys.add(key);
    included.push({
      sourcePath: entry.path,
      path,
      ...(entry.size === undefined ? {} : { declaredSize: entry.size }),
    });
  }
  included.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  excludedCaches.sort((left, right) => left.localeCompare(right, 'en'));

  const limits = ZIP32_LIMITS;
  if (included.length > limits.maxEntryCount - 1) {
    throw new PortableVaultError(
      'archive-too-large',
      `Portable ZIP export supports at most ${limits.maxEntryCount - 1} user files.`,
    );
  }

  const files: Array<readonly [string, Uint8Array]> = [];
  const captured: CapturedExportEntry[] = [];
  const manifest: PortableVaultManifest = {
    format: PORTABLE_FORMAT,
    exportVersion: PORTABLE_EXPORT_VERSION,
    schemaVersions: {
      note: PORTABLE_NOTE_SCHEMA_VERSION,
      settings: PORTABLE_SETTINGS_SCHEMA_VERSION,
    },
    generatedAt: validateGeneratedAt(options.generatedAt ?? new Date().toISOString()),
    files: [],
    excludedCaches,
  };
  let expandedSize = 0;
  for (const entry of included) {
    if (entry.declaredSize !== undefined && entry.declaredSize > limits.maxEntryBytes) {
      throw new PortableVaultError('archive-too-large', `The file exceeds 64 MiB: ${entry.path}.`);
    }
    if (encoder.encode(entry.path).byteLength > 0xffff) {
      throw new PortableVaultError('archive-too-large', `The path is too long to export: ${entry.path}.`);
    }
    let bytes: Uint8Array;
    try {
      bytes = await readPortableSource(vault, entry.sourcePath);
    } catch {
      throw sourceChanged();
    }
    if (bytes.byteLength > limits.maxEntryBytes) {
      throw new PortableVaultError('archive-too-large', `The file exceeds 64 MiB: ${entry.path}.`);
    }
    expandedSize += bytes.byteLength;
    if (expandedSize > limits.maxTotalBytes) {
      throw new PortableVaultError('archive-too-large', 'The expanded export exceeds 512 MiB.');
    }
    const checksum = await sha256(bytes);
    files.push([entry.path, bytes]);
    manifest.files.push({ path: entry.path, sha256: checksum, size: bytes.byteLength });
    captured.push({
      sourcePath: entry.sourcePath,
      path: entry.path,
      sha256: checksum,
      size: bytes.byteLength,
    });
  }

  await assertSourceUnchanged(vault, captured, excludedCaches);
  if (await vault.getRevision() !== sourceRevision) throw sourceChanged();

  const manifestBytes = encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  expandedSize += manifestBytes.byteLength;
  if (manifestBytes.byteLength > limits.maxEntryBytes || expandedSize > limits.maxTotalBytes) {
    throw new PortableVaultError('archive-too-large', 'The expanded export exceeds 512 MiB.');
  }
  files.push([PORTABLE_MANIFEST_PATH, manifestBytes]);
  const estimatedSize = files.reduce(
    (total, [path, bytes]) => total + 76 + encoder.encode(path).byteLength * 2 + bytes.byteLength,
    22,
  );
  if (estimatedSize > limits.maxArchiveBytes || estimatedSize > 0xffff_ffff) {
    throw new PortableVaultError('archive-too-large', 'The ZIP32 archive exceeds 512 MiB.');
  }
  try {
    return createZip32(files);
  } catch (error) {
    if (error instanceof Zip32Error) throw new PortableVaultError(error.code, error.message);
    throw error;
  }
}
