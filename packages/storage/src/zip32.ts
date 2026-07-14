export const ZIP32_LIMITS = {
  maxArchiveBytes: 512 * 1024 * 1024,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxEntryCount: 10_000,
} as const;

export type Zip32ErrorCode =
  | 'archive-too-large'
  | 'checksum-failed'
  | 'invalid-archive'
  | 'unsupported-archive';

export class Zip32Error extends Error {
  constructor(readonly code: Zip32ErrorCode, message: string) {
    super(message);
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb8_8320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function numberBytes(value: number, length: 2 | 4): Uint8Array {
  const bytes = new Uint8Array(length);
  if (length === 2) new DataView(bytes.buffer).setUint16(0, value, true);
  else new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function joinBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function createZip32(files: ReadonlyArray<readonly [string, Uint8Array]>): Uint8Array {
  if (files.length > ZIP32_LIMITS.maxEntryCount) {
    throw new Zip32Error('archive-too-large', 'The ZIP contains too many entries.');
  }
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;
  for (const [path, bytes] of files) {
    const name = encoder.encode(path);
    if (name.byteLength > 0xffff || bytes.byteLength > ZIP32_LIMITS.maxEntryBytes) {
      throw new Zip32Error('archive-too-large', 'A ZIP entry exceeds the ZIP32 safety limits.');
    }
    const checksum = crc32(bytes);
    const local = joinBytes([
      numberBytes(0x0403_4b50, 4), numberBytes(20, 2), numberBytes(0x0800, 2),
      numberBytes(0, 2), numberBytes(0, 2), numberBytes(0, 2), numberBytes(checksum, 4),
      numberBytes(bytes.byteLength, 4), numberBytes(bytes.byteLength, 4),
      numberBytes(name.byteLength, 2), numberBytes(0, 2), name, bytes,
    ]);
    localChunks.push(local);
    centralChunks.push(joinBytes([
      numberBytes(0x0201_4b50, 4), numberBytes(20, 2), numberBytes(20, 2),
      numberBytes(0x0800, 2), numberBytes(0, 2), numberBytes(0, 2), numberBytes(0, 2),
      numberBytes(checksum, 4), numberBytes(bytes.byteLength, 4),
      numberBytes(bytes.byteLength, 4), numberBytes(name.byteLength, 2), numberBytes(0, 2),
      numberBytes(0, 2), numberBytes(0, 2), numberBytes(0, 2), numberBytes(0, 4),
      numberBytes(offset, 4), name,
    ]));
    offset += local.byteLength;
  }
  const central = joinBytes(centralChunks);
  const archive = joinBytes([
    ...localChunks, central, numberBytes(0x0605_4b50, 4), numberBytes(0, 2),
    numberBytes(0, 2), numberBytes(files.length, 2), numberBytes(files.length, 2),
    numberBytes(central.byteLength, 4), numberBytes(offset, 4), numberBytes(0, 2),
  ]);
  if (archive.byteLength > ZIP32_LIMITS.maxArchiveBytes) {
    throw new Zip32Error('archive-too-large', 'The ZIP archive exceeds 512 MiB.');
  }
  return archive;
}

function requireRange(bytes: Uint8Array, offset: number, length: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 ||
    offset + length > bytes.byteLength) {
    throw new Zip32Error('invalid-archive', `${label} is outside the ZIP archive.`);
  }
}

function validateEntryPath(path: string): void {
  if (path.length === 0 || path.includes('\0') || path.includes('\\') || path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) || path.endsWith('/') ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..' ||
      segment.toLocaleLowerCase('en').startsWith('.studio-'))) {
    throw new Zip32Error('invalid-archive', 'The ZIP contains an unsafe path.');
  }
}

async function inflateRaw(bytes: Uint8Array, maximumSize: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Zip32Error('unsupported-archive', 'Deflate-compressed ZIP entries are not supported.');
  }
  try {
    const reader = new Blob([bytes.slice().buffer]).stream()
      .pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat)).getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumSize) {
        await reader.cancel();
        throw new Zip32Error('archive-too-large', 'A ZIP entry expands beyond its declared limit.');
      }
      chunks.push(value);
    }
    return joinBytes(chunks);
  } catch (error) {
    if (error instanceof Zip32Error) throw error;
    throw new Zip32Error('invalid-archive', 'A compressed ZIP entry is invalid.');
  }
}

export async function parseZip32(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (bytes.byteLength > ZIP32_LIMITS.maxArchiveBytes) {
    throw new Zip32Error('archive-too-large', 'The ZIP archive exceeds 512 MiB.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = bytes.byteLength - 22;
  const searchFloor = Math.max(0, bytes.byteLength - 65_557);
  while (endOffset >= searchFloor && view.getUint32(endOffset, true) !== 0x0605_4b50) endOffset -= 1;
  if (endOffset < searchFloor) throw new Zip32Error('invalid-archive', 'The ZIP archive is invalid.');
  requireRange(bytes, endOffset, 22, 'The ZIP end record');
  const commentLength = view.getUint16(endOffset + 20, true);
  if (endOffset + 22 + commentLength !== bytes.byteLength) {
    throw new Zip32Error('invalid-archive', 'The ZIP end record is invalid.');
  }
  const count = view.getUint16(endOffset + 10, true);
  if (count > ZIP32_LIMITS.maxEntryCount || view.getUint16(endOffset + 8, true) !== count) {
    throw new Zip32Error('archive-too-large', 'The ZIP contains too many entries.');
  }
  const centralSize = view.getUint32(endOffset + 12, true);
  let offset = view.getUint32(endOffset + 16, true);
  const centralEnd = offset + centralSize;
  requireRange(bytes, offset, centralSize, 'The ZIP directory');
  if (centralEnd !== endOffset) throw new Zip32Error('invalid-archive', 'The ZIP directory is invalid.');

  const files = new Map<string, Uint8Array>();
  let totalSize = 0;
  for (let index = 0; index < count; index += 1) {
    requireRange(bytes, offset, 46, 'A ZIP directory entry');
    if (view.getUint32(offset, true) !== 0x0201_4b50) {
      throw new Zip32Error('invalid-archive', 'The ZIP directory is invalid.');
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const expectedCrc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const entryCommentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const entryLength = 46 + nameLength + extraLength + entryCommentLength;
    requireRange(bytes, offset, entryLength, 'A ZIP directory entry');
    if ((flags & 0x0001) !== 0 || (flags & ~0x0808) !== 0 || ![0, 8].includes(method)) {
      throw new Zip32Error('unsupported-archive', 'The ZIP uses unsupported encryption or compression.');
    }
    if (uncompressedSize > ZIP32_LIMITS.maxEntryBytes) {
      throw new Zip32Error('archive-too-large', 'A ZIP entry exceeds 64 MiB.');
    }
    let path: string;
    try {
      path = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    } catch {
      throw new Zip32Error('invalid-archive', 'A ZIP path is not valid UTF-8.');
    }
    validateEntryPath(path);
    requireRange(bytes, localOffset, 30, 'A ZIP local entry');
    if (view.getUint32(localOffset, true) !== 0x0403_4b50) {
      throw new Zip32Error('invalid-archive', 'A ZIP local entry is invalid.');
    }
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    requireRange(bytes, localOffset + 30, localNameLength + localExtraLength, 'A ZIP local header');
    requireRange(bytes, dataOffset, compressedSize, 'ZIP entry data');
    let localName: string;
    try {
      localName = decoder.decode(bytes.slice(localOffset + 30, localOffset + 30 + localNameLength));
    } catch {
      throw new Zip32Error('invalid-archive', 'A ZIP path is not valid UTF-8.');
    }
    if (localName !== path || localFlags !== flags || localMethod !== method) {
      throw new Zip32Error('invalid-archive', 'ZIP headers do not agree.');
    }
    const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
    const content = method === 0 ? compressed : await inflateRaw(compressed, uncompressedSize);
    if (content.byteLength !== uncompressedSize) {
      throw new Zip32Error('invalid-archive', `ZIP size validation failed for ${path}.`);
    }
    if (crc32(content) !== expectedCrc) {
      throw new Zip32Error('checksum-failed', `ZIP checksum failed for ${path}.`);
    }
    if (files.has(path)) throw new Zip32Error('invalid-archive', 'The ZIP contains duplicate paths.');
    files.set(path, content);
    totalSize += content.byteLength;
    if (totalSize > ZIP32_LIMITS.maxTotalBytes) {
      throw new Zip32Error('archive-too-large', 'The expanded ZIP exceeds 512 MiB.');
    }
    offset += entryLength;
  }
  if (offset !== centralEnd) throw new Zip32Error('invalid-archive', 'The ZIP directory is malformed.');
  return files;
}
