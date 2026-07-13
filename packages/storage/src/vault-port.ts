export interface VaultEntry {
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
  contentHash?: string;
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
}

export interface MoveCondition {
  /** Move only when the source still has this content hash. */
  expectedHash?: string;
  /** Exact public Markdown/extensionless note state observed before a guarded recovery move. */
  expectedUserState?: ReadonlyArray<{ path: string; hash: string }>;
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
