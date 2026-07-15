import { VaultUnavailableError } from './conflict';

export const PORTABLE_MANIFEST_PATH = '.studio/export-manifest.json';
export const PORTABLE_FORMAT = 'ateliera-vault' as const;
export const PORTABLE_EXPORT_VERSION = 1 as const;
export const PORTABLE_NOTE_SCHEMA_VERSION = 1 as const;
export const PORTABLE_SETTINGS_SCHEMA_VERSION = 1 as const;
export const PORTABLE_MAX_ENTRY_BYTES = 64 * 1024 * 1024;
export const PORTABLE_MAX_USER_FILES = 9_999;

export type PortableVaultErrorCode =
  | 'active-content'
  | 'archive-too-large'
  | 'checksum-failed'
  | 'confirmation-required'
  | 'invalid-archive'
  | 'invalid-manifest'
  | 'invalid-path'
  | 'path-collision'
  | 'source-changed'
  | 'target-changed'
  | 'unresolved-conflict'
  | 'unsupported-archive';

export class PortableVaultError extends VaultUnavailableError {
  constructor(readonly code: PortableVaultErrorCode, message: string) {
    super(message);
  }
}

export interface PortableFileDescriptor {
  path: string;
  sha256: string;
  size: number;
}

export interface PortableVaultManifest {
  format: typeof PORTABLE_FORMAT;
  exportVersion: typeof PORTABLE_EXPORT_VERSION;
  schemaVersions: {
    note: typeof PORTABLE_NOTE_SCHEMA_VERSION;
    settings: typeof PORTABLE_SETTINGS_SCHEMA_VERSION;
  };
  generatedAt: string;
  files: PortableFileDescriptor[];
  excludedCaches: string[];
}

const ACTIVE_EXTENSIONS = new Set([
  'app', 'bat', 'cmd', 'command', 'com', 'cpl', 'css', 'dll', 'dmg', 'exe',
  'gadget', 'hta', 'htm', 'html', 'jar', 'js', 'jse', 'jsx', 'mjs', 'msi',
  'pif', 'ps1', 'scf', 'scr', 'sh', 'svg', 'ts', 'tsx', 'vb', 'vbe', 'vbs',
  'wasm', 'ws', 'wsc', 'wsf', 'wsh',
]);
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\.|$)/i;
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:/;

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) as number;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

export function portablePathKey(path: string): string {
  return path.normalize('NFC').toLocaleLowerCase('en');
}

export function validatePortablePath(path: string): string {
  const normalized = path.normalize('NFC');
  if (
    normalized.length === 0 ||
    normalized.length > 1024 ||
    normalized !== path ||
    normalized.includes('\\') ||
    normalized.startsWith('/') ||
    normalized.endsWith('/') ||
    WINDOWS_DRIVE_PATH.test(normalized) ||
    hasControlCharacters(normalized)
  ) {
    throw new PortableVaultError('invalid-path', 'The archive contains an unsafe or non-portable path.');
  }
  const segments = normalized.split('/');
  if (segments.some((segment) =>
    segment.length === 0 || segment.length > 255 || segment === '.' || segment === '..' ||
    segment.endsWith('.') || segment.endsWith(' ') || WINDOWS_RESERVED.test(segment) ||
    segment.toLocaleLowerCase('en').startsWith('.studio-'))) {
    throw new PortableVaultError('invalid-path', 'The archive contains a reserved path.');
  }
  return normalized;
}

export function assertNoActiveContent(path: string): void {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  const extension = dot < 0 ? '' : name.slice(dot + 1).toLocaleLowerCase('en');
  if (ACTIVE_EXTENSIONS.has(extension)) {
    throw new PortableVaultError(
      'active-content',
      `Active or executable content is not supported in portable Studio archives: ${path}.`,
    );
  }
}

export type ExportDisposition = 'include' | 'cache' | 'internal';

export function exportDisposition(path: string): ExportDisposition {
  const lower = path.toLocaleLowerCase('en');
  if (!lower.startsWith('.studio/')) return 'include';
  if (
    lower === '.studio/settings.json' ||
    lower === '.studio/config.json' ||
    lower.startsWith('.studio/settings/') ||
    lower.startsWith('.studio/config/') ||
    lower.startsWith('.studio/views/') ||
    lower.startsWith('.studio/seasons/') ||
    lower.startsWith('.studio/backups/') ||
    lower.startsWith('.studio/trash/')
  ) return 'include';
  if (
    lower.startsWith('.studio/index/') ||
    lower.startsWith('.studio/cache/') ||
    lower.startsWith('.studio/thumbnails/') ||
    lower.startsWith('.studio/import-stage/') ||
    lower.startsWith('.studio/import-backup/') ||
    lower.startsWith('.studio/tmp/') ||
    lower.startsWith('.studio/revisions/')
  ) return 'cache';
  return 'internal';
}

export function validPortableManifest(value: unknown): value is PortableVaultManifest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const exactKeys = (record: Record<string, unknown>, keys: readonly string[]) => {
    const actual = Object.keys(record).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]);
  };
  if (!exactKeys(candidate, [
    'excludedCaches', 'exportVersion', 'files', 'format', 'generatedAt', 'schemaVersions',
  ])) return false;
  const schemas = candidate.schemaVersions;
  const files = candidate.files;
  const canonicalGeneratedAt = typeof candidate.generatedAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(candidate.generatedAt) &&
    !Number.isNaN(Date.parse(candidate.generatedAt)) &&
    new Date(candidate.generatedAt).toISOString() === candidate.generatedAt;
  return candidate.format === PORTABLE_FORMAT &&
    candidate.exportVersion === PORTABLE_EXPORT_VERSION &&
    canonicalGeneratedAt &&
    schemas !== null && typeof schemas === 'object' && !Array.isArray(schemas) &&
    exactKeys(schemas as Record<string, unknown>, ['note', 'settings']) &&
    (schemas as Record<string, unknown>).note === PORTABLE_NOTE_SCHEMA_VERSION &&
    (schemas as Record<string, unknown>).settings === PORTABLE_SETTINGS_SCHEMA_VERSION &&
    Array.isArray(candidate.excludedCaches) &&
    candidate.excludedCaches.length <= PORTABLE_MAX_USER_FILES &&
    candidate.excludedCaches.every((path) => typeof path === 'string') &&
    Array.isArray(files) && files.length <= PORTABLE_MAX_USER_FILES && files.every((item) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) return false;
      const file = item as Record<string, unknown>;
      return exactKeys(file, ['path', 'sha256', 'size']) &&
        typeof file.path === 'string' && typeof file.sha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(file.sha256) && Number.isSafeInteger(file.size) &&
        typeof file.size === 'number' && file.size >= 0 && file.size <= PORTABLE_MAX_ENTRY_BYTES;
    });
}
