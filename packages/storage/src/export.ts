import { ZIP32_LIMITS, Zip32Error, createZip32, sha256 } from './zip32';
import {
  PORTABLE_EXPORT_VERSION,
  PORTABLE_FORMAT,
  PORTABLE_MANIFEST_PATH,
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

export async function exportVault(
  vault: VaultPort,
  options: ExportVaultOptions = {},
): Promise<Uint8Array> {
  const entries = (await vault.list()).filter((entry) => entry.kind === 'file');
  const included: Array<{ sourcePath: string; path: string }> = [];
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
    included.push({ sourcePath: entry.path, path });
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
    if (encoder.encode(entry.path).byteLength > 0xffff) {
      throw new PortableVaultError('archive-too-large', `The path is too long to export: ${entry.path}.`);
    }
    const bytes = await vault.readBinary(entry.sourcePath);
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
  }

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
