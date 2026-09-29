import { PathEscapeError, VaultConflictError, VaultUnavailableError } from './conflict';
import { isPublicNotePath } from './vault-port';
import type {
  MoveCondition,
  VaultAtomicWriteBatch,
  VaultAtomicWriteResult,
  VaultChange,
  VaultEntry,
  VaultPort,
  WriteCondition,
} from './vault-port';

interface StoredFile {
  bytes: Uint8Array;
  hash: string;
}

function sameUserState(
  files: Map<string, StoredFile>,
  expected: NonNullable<MoveCondition['expectedUserState']>,
): boolean {
  const current = [...files.entries()]
    .filter(([path]) => isPublicNotePath(path))
    .map(([path, file]) => ({ path, hash: file.hash }))
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const observed = [...expected].sort((left, right) => left.path.localeCompare(right.path, 'en'));
  return current.length === observed.length && current.every((entry, index) =>
    entry.path === observed[index]?.path && entry.hash === observed[index]?.hash);
}

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:/;

function validatePath(path: string): string {
  if (
    path.length === 0 ||
    path.includes('\0') ||
    path.includes('\\') ||
    path.startsWith('/') ||
    WINDOWS_DRIVE_PATH.test(path) ||
    path === '.' ||
    path.endsWith('/')
  ) {
    throw new PathEscapeError();
  }

  const segments = path.split('/');
  if (segments.some((segment) =>
    segment === '' || segment === '.' || segment === '..' ||
    segment.slice(0, '.studio-'.length).toLocaleLowerCase('en') === '.studio-')) {
    throw new PathEscapeError();
  }

  return path;
}

// Web Crypto (available in Node 22 and browsers) so the in-memory vault bundles for
// the browser app; SHA-256 hex, matching the browser vault and the retired node:crypto.
async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function parentDirectories(path: string): string[] {
  const segments = path.split('/');
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
}

class InMemoryVault implements VaultPort {
  readonly #files = new Map<string, StoredFile>();
  readonly #listeners = new Set<(event: VaultChange) => void>();
  readonly #encoder = new TextEncoder();
  readonly #decoder = new TextDecoder('utf-8', { fatal: true });
  #revision = 0n;

  async getRevision(): Promise<string> {
    return this.#revision.toString();
  }

  async list(prefix?: string): Promise<VaultEntry[]> {
    if (prefix !== undefined) validatePath(prefix);
    const entries = new Map<string, VaultEntry>();

    for (const [path, file] of this.#files) {
      for (const directory of parentDirectories(path)) {
        entries.set(directory, { path: directory, kind: 'directory' });
      }
      entries.set(path, {
        path,
        kind: 'file',
        size: file.bytes.byteLength,
        contentHash: file.hash,
      });
    }

    return [...entries.values()]
      .filter((entry) => prefix === undefined || entry.path === prefix || entry.path.startsWith(`${prefix}/`))
      .sort((left, right) => left.path.localeCompare(right.path, 'en'));
  }

  async readText(path: string): Promise<{ text: string; hash: string }> {
    const file = this.#requiredFile(validatePath(path));
    try {
      return { text: this.#decoder.decode(file.bytes), hash: file.hash };
    } catch {
      throw new VaultUnavailableError('The requested Studio file is not valid UTF-8 text.');
    }
  }

  async writeTextAtomic(
    path: string,
    text: string,
    condition?: WriteCondition,
  ): Promise<{ hash: string }> {
    return this.#write(validatePath(path), this.#encoder.encode(text), condition);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    return this.#requiredFile(validatePath(path)).bytes.slice();
  }

  async writeBinaryAtomic(
    path: string,
    bytes: Uint8Array,
    condition?: WriteCondition,
  ): Promise<{ hash: string }> {
    return this.#write(validatePath(path), bytes, condition);
  }

  async move(from: string, to: string, condition?: MoveCondition): Promise<void> {
    const sourcePath = validatePath(from);
    const destinationPath = validatePath(to);
    const file = this.#requiredFile(sourcePath);
    if (condition?.expectedHash !== undefined && file.hash !== condition.expectedHash) {
      throw new VaultConflictError();
    }
    if (condition?.expectedUserState !== undefined &&
      !sameUserState(this.#files, condition.expectedUserState)) {
      throw new VaultConflictError();
    }
    if (this.#files.has(destinationPath)) throw new VaultConflictError();

    this.#files.delete(sourcePath);
    this.#files.set(destinationPath, file);
    this.#advanceRevision();
    this.#emit({ kind: 'moved', path: destinationPath, previousPath: sourcePath, hash: file.hash });
  }

  async remove(path: string, condition?: WriteCondition): Promise<void> {
    const validPath = validatePath(path);
    const current = this.#files.get(validPath);
    if (current !== undefined && condition?.expectedMissing) {
      throw new VaultConflictError();
    }
    if (
      current !== undefined &&
      condition?.expectedHash !== undefined &&
      current.hash !== condition.expectedHash
    ) {
      throw new VaultConflictError();
    }
    if (condition?.expectedUserState !== undefined &&
      !sameUserState(this.#files, condition.expectedUserState)) {
      throw new VaultConflictError();
    }
    if (!this.#files.delete(validPath)) throw new VaultUnavailableError();
    this.#advanceRevision();
    this.#emit({ kind: 'removed', path: validPath });
  }

  async exists(path: string): Promise<boolean> {
    return this.#files.has(validatePath(path));
  }

  async writeBatchAtomic(input: VaultAtomicWriteBatch): Promise<VaultAtomicWriteResult> {
    // Hash every write first (the only await); the revision gate, per-write
    // conflict checks, and the mutation then run as one synchronous critical
    // section so two concurrent batches can't both pass the revision gate.
    const hashed = await Promise.all(
      input.writes.map(async (write) => {
        // .slice() runs synchronously (before digest's await), so a caller
        // mutating its array during the async hash can't change what we store.
        const bytes = write.bytes.slice();
        return { write, bytes, hash: await digest(bytes) };
      }),
    );

    if (input.expectedRevision !== this.#revision.toString()) {
      throw new VaultConflictError();
    }
    const paths = new Set<string>();
    const prepared = hashed.map(({ write, bytes, hash }) => {
      const path = validatePath(write.path);
      if (paths.has(path)) throw new VaultConflictError('A batch cannot write the same path twice.');
      paths.add(path);
      if (write.expectedHash !== undefined && write.expectedMissing) {
        throw new VaultConflictError('A batch write condition is invalid.');
      }
      const previous = this.#files.get(path);
      if (write.expectedMissing && previous !== undefined) throw new VaultConflictError();
      if (write.expectedHash !== undefined && previous?.hash !== write.expectedHash) {
        throw new VaultConflictError();
      }
      return { path, bytes, hash, previous };
    });

    for (const write of prepared) {
      this.#files.set(write.path, { bytes: write.bytes, hash: write.hash });
    }
    if (prepared.length > 0) this.#advanceRevision();
    for (const write of prepared) {
      this.#emit({
        kind: write.previous === undefined ? 'created' : 'modified',
        path: write.path,
        hash: write.hash,
      });
    }
    return {
      revision: this.#revision.toString(),
      results: prepared.map(({ path, hash }) => ({ path, hash })),
    };
  }

  async watch(listener: (event: VaultChange) => void): Promise<() => void> {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #requiredFile(path: string): StoredFile {
    const file = this.#files.get(path);
    if (file === undefined) throw new VaultUnavailableError();
    return file;
  }

  async #write(
    path: string,
    sourceBytes: Uint8Array,
    condition?: WriteCondition,
  ): Promise<{ hash: string }> {
    // Hash first (the only await); the conflict check and the write then run as one
    // synchronous critical section, so two concurrent writers can't both pass it.
    const bytes = sourceBytes.slice();
    const hash = await digest(bytes);

    const previous = this.#files.get(path);
    if (condition?.expectedMissing && previous !== undefined) {
      throw new VaultConflictError();
    }
    if (condition?.expectedHash !== undefined && previous?.hash !== condition.expectedHash) {
      throw new VaultConflictError();
    }
    if (condition?.expectedUserState !== undefined &&
      !sameUserState(this.#files, condition.expectedUserState)) {
      throw new VaultConflictError();
    }

    this.#files.set(path, { bytes, hash });
    this.#advanceRevision();
    this.#emit({ kind: previous === undefined ? 'created' : 'modified', path, hash });
    return { hash };
  }

  #advanceRevision(): void {
    this.#revision += 1n;
  }

  #emit(event: VaultChange): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener(event);
      } catch {
        // A committed mutation cannot be rolled back by an observer failure.
      }
    }
  }
}

export function createInMemoryVault(): VaultPort {
  return new InMemoryVault();
}
