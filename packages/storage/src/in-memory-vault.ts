import { createHash } from 'node:crypto';

import { PathEscapeError, VaultConflictError, VaultUnavailableError } from './conflict';
import type { MoveCondition, VaultChange, VaultEntry, VaultPort, WriteCondition } from './vault-port';

interface StoredFile {
  bytes: Uint8Array;
  hash: string;
}

function isUserNotePath(path: string): boolean {
  if (path.toLocaleLowerCase('en').startsWith('.studio/')) return false;
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.toLocaleLowerCase('en').endsWith('.md') || !name.includes('.');
}

function sameUserState(
  files: Map<string, StoredFile>,
  expected: NonNullable<MoveCondition['expectedUserState']>,
): boolean {
  const current = [...files.entries()]
    .filter(([path]) => isUserNotePath(path))
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

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
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
      throw new VaultUnavailableError('The requested vault entry is not valid UTF-8 text.');
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
    if (!this.#files.delete(validPath)) throw new VaultUnavailableError();
    this.#emit({ kind: 'removed', path: validPath });
  }

  async exists(path: string): Promise<boolean> {
    return this.#files.has(validatePath(path));
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

  #write(path: string, sourceBytes: Uint8Array, condition?: WriteCondition): { hash: string } {
    const previous = this.#files.get(path);
    if (condition?.expectedMissing && previous !== undefined) {
      throw new VaultConflictError();
    }
    if (condition?.expectedHash !== undefined && previous?.hash !== condition.expectedHash) {
      throw new VaultConflictError();
    }

    const bytes = sourceBytes.slice();
    const hash = digest(bytes);
    this.#files.set(path, { bytes, hash });
    this.#emit({ kind: previous === undefined ? 'created' : 'modified', path, hash });
    return { hash };
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
