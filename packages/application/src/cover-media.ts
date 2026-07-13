import { VaultUnavailableError } from '@studio/storage/portable';
import type { VaultPort } from '@studio/storage/portable';

export const MAX_COVER_MEDIA_BYTES = 16 * 1024 * 1024;

export type CoverMediaMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'image/avif';

export type CoverMediaResult =
  | { kind: 'none' }
  | {
      kind: 'available';
      path: string;
      mimeType: CoverMediaMimeType;
      bytes: Uint8Array;
    }
  | {
      kind: 'unavailable';
      reason: 'unsafe-reference' | 'missing' | 'unsupported-format' | 'too-large';
      reference: string;
    };

const MIME_BY_EXTENSION: Readonly<Record<string, CoverMediaMimeType>> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:/;
const URI_SCHEME = /^[A-Za-z][A-Za-z\d+.-]*:/;

function unavailable(
  reference: string,
  reason: Extract<CoverMediaResult, { kind: 'unavailable' }>['reason'],
): CoverMediaResult {
  return { kind: 'unavailable', reason, reference };
}

function normalizeCoverPath(notePath: string, reference: string): string | undefined {
  if (
    reference === '' ||
    reference.includes('\0') ||
    reference.includes('\\') ||
    reference.includes('?') ||
    reference.includes('#') ||
    reference.startsWith('/') ||
    WINDOWS_DRIVE_PATH.test(reference) ||
    URI_SCHEME.test(reference)
  ) return undefined;

  const noteSegments = notePath.split('/');
  if (noteSegments.some((segment) => segment === '')) return undefined;
  const resolved = noteSegments.slice(0, -1);
  for (const segment of reference.split('/')) {
    if (segment === '') return undefined;
    if (segment === '.') continue;
    if (segment === '..') {
      if (resolved.length === 0) return undefined;
      resolved.pop();
      continue;
    }
    if (segment.toLocaleLowerCase('en') === '.studio' ||
      segment.slice(0, '.studio-'.length).toLocaleLowerCase('en') === '.studio-') {
      return undefined;
    }
    resolved.push(segment);
  }
  return resolved.length === 0 ? undefined : resolved.join('/');
}

function bytesEqual(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function asciiEqual(bytes: Uint8Array, offset: number, value: string): boolean {
  return [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

function sniffMimeType(bytes: Uint8Array): CoverMediaMimeType | undefined {
  if (bytesEqual(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (bytesEqual(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (asciiEqual(bytes, 0, 'GIF87a') || asciiEqual(bytes, 0, 'GIF89a')) return 'image/gif';
  if (asciiEqual(bytes, 0, 'RIFF') && asciiEqual(bytes, 8, 'WEBP')) return 'image/webp';
  if (asciiEqual(bytes, 4, 'ftyp') &&
    (asciiEqual(bytes, 8, 'avif') || asciiEqual(bytes, 8, 'avis'))) return 'image/avif';
  return undefined;
}

function expectedMimeType(path: string): CoverMediaMimeType | undefined {
  const filename = path.slice(path.lastIndexOf('/') + 1);
  const extensionIndex = filename.lastIndexOf('.');
  if (extensionIndex < 0) return undefined;
  return MIME_BY_EXTENSION[filename.slice(extensionIndex).toLocaleLowerCase('en')];
}

export async function resolveCoverMedia(
  vault: VaultPort,
  notePath: string,
  reference: string | undefined,
): Promise<CoverMediaResult> {
  if (reference === undefined) return { kind: 'none' };
  const path = normalizeCoverPath(notePath, reference);
  if (path === undefined) return unavailable(reference, 'unsafe-reference');
  const expectedMime = expectedMimeType(path);
  if (expectedMime === undefined) return unavailable(reference, 'unsupported-format');

  const entry = (await vault.list(path)).find((candidate) =>
    candidate.kind === 'file' && candidate.path === path);
  if (entry === undefined) return unavailable(reference, 'missing');
  if (entry.size !== undefined && entry.size > MAX_COVER_MEDIA_BYTES) {
    return unavailable(reference, 'too-large');
  }

  let bytes: Uint8Array;
  try {
    bytes = await vault.readBinary(path);
  } catch (error) {
    if (error instanceof VaultUnavailableError && !(await vault.exists(path))) {
      return unavailable(reference, 'missing');
    }
    throw error;
  }
  if (bytes.byteLength > MAX_COVER_MEDIA_BYTES) return unavailable(reference, 'too-large');
  if (sniffMimeType(bytes) !== expectedMime) return unavailable(reference, 'unsupported-format');
  return { kind: 'available', path, mimeType: expectedMime, bytes };
}
