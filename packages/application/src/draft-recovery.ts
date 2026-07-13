export interface DraftRecoveryRecord {
  key: string;
  title?: string;
  body: string;
  expectedHash: string;
  updatedAt: string;
}

export interface DraftRecoveryStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export type DraftRecoveryResult =
  | { kind: 'none' }
  | { kind: 'recoverable'; draft: DraftRecoveryRecord }
  | { kind: 'stale'; draft: DraftRecoveryRecord };

export interface DraftRecoveryStore {
  read(key: string): DraftRecoveryRecord | null;
  readForDurable(key: string, durableHash: string): DraftRecoveryResult;
  remove(key: string): void;
  write(record: DraftRecoveryRecord): void;
}

const PREFIX = 'studio:draft-recovery:';

function storageKey(key: string): string {
  return `${PREFIX}${encodeURIComponent(key)}`;
}

function isRecord(value: unknown, key: string): value is DraftRecoveryRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.key === key &&
    typeof candidate.body === 'string' &&
    typeof candidate.expectedHash === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(candidate.updatedAt)) &&
    (candidate.title === undefined || typeof candidate.title === 'string')
  );
}

export function createDraftRecoveryStore(
  storage: DraftRecoveryStorage,
): DraftRecoveryStore {
  return {
    read(key) {
      const namespacedKey = storageKey(key);
      const value = storage.getItem(namespacedKey);
      if (value === null) return null;
      try {
        const parsed: unknown = JSON.parse(value);
        if (isRecord(parsed, key)) return parsed;
      } catch {
        // A partial browser write is not recoverable and must not block editing.
      }
      storage.removeItem(namespacedKey);
      return null;
    },

    readForDurable(key, durableHash) {
      const draft = this.read(key);
      if (draft === null) return { kind: 'none' };
      return draft.expectedHash === durableHash
        ? { kind: 'recoverable', draft }
        : { kind: 'stale', draft };
    },

    remove(key) {
      storage.removeItem(storageKey(key));
    },

    write(record) {
      storage.setItem(storageKey(record.key), JSON.stringify(record));
    },
  };
}
