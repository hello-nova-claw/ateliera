export interface VaultEntry {
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
  contentHash?: string;
}

export interface VaultUserStateEntry {
  path: string;
  hash: string;
}

export function isPublicNotePath(path: string): boolean {
  if (path.toLocaleLowerCase('en').startsWith('.studio/')) return false;
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.toLocaleLowerCase('en').endsWith('.md') || !name.includes('.');
}

export interface WriteCondition {
  /**
   * Replace only the version with this content hash. Adapters guarantee this comparison within
   * their documented mutation-coordination boundary. The desktop adapter coordinates Studio
   * writers through the vault's `.studio-write.lock`; arbitrary tools that ignore that advisory
   * lock are outside the exact compare-and-replace guarantee.
   */
  expectedHash?: string;
  /** Create only when the path does not exist. */
  expectedMissing?: true;
  /** Apply only while the exact public Markdown/extensionless note set is unchanged. */
  expectedUserState?: ReadonlyArray<VaultUserStateEntry>;
}

export interface MoveCondition {
  /** Move only when the source still has this content hash. */
  expectedHash?: string;
  /** Exact public Markdown/extensionless note state observed before a guarded recovery move. */
  expectedUserState?: ReadonlyArray<VaultUserStateEntry>;
}

export type VaultChange =
  | { kind: 'created' | 'modified'; path: string; hash: string }
  | { kind: 'moved'; path: string; previousPath: string; hash: string }
  | { kind: 'removed'; path: string };

export interface VaultPort {
  list(prefix?: string): Promise<VaultEntry[]>;
  readText(path: string): Promise<{ text: string; hash: string }>;
  writeTextAtomic(
    path: string,
    text: string,
    condition?: WriteCondition,
  ): Promise<{ hash: string }>;
  readBinary(path: string): Promise<Uint8Array>;
  writeBinaryAtomic(
    path: string,
    bytes: Uint8Array,
    condition?: WriteCondition,
  ): Promise<{ hash: string }>;
  move(from: string, to: string, condition?: MoveCondition): Promise<void>;
  remove(path: string, condition?: WriteCondition): Promise<void>;
  exists(path: string): Promise<boolean>;
  watch(listener: (event: VaultChange) => void): Promise<() => void>;
}
