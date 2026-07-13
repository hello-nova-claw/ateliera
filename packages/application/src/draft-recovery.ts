export interface DraftRecoveryRecord {
  studioId: string;
  path: string;
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
  read(studioId: string, path: string): DraftRecoveryRecord | null;
  readForDurable(studioId: string, path: string, durableHash: string): DraftRecoveryResult;
  remove(studioId: string, path: string): boolean;
  write(record: DraftRecoveryRecord): boolean;
}

const PREFIX = 'studio:draft-recovery:';

function storageKey(studioId: string, path: string): string {
  return `${PREFIX}${encodeURIComponent(studioId)}:${encodeURIComponent(path)}`;
}

function isRecord(value: unknown, studioId: string, path: string): value is DraftRecoveryRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.studioId === studioId &&
    candidate.path === path &&
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
    read(studioId, path) {
      const namespacedKey = storageKey(studioId, path);
      let value: string | null;
      try {
        value = storage.getItem(namespacedKey);
      } catch {
        return null;
      }
      if (value === null) return null;
      try {
        const parsed: unknown = JSON.parse(value);
        if (isRecord(parsed, studioId, path)) return parsed;
      } catch {
        // A partial browser write is not recoverable and must not block editing.
      }
      try {
        storage.removeItem(namespacedKey);
      } catch {
        // Storage may be disabled. Editing must remain available.
      }
      return null;
    },

    readForDurable(studioId, path, durableHash) {
      const draft = this.read(studioId, path);
      if (draft === null) return { kind: 'none' };
      return draft.expectedHash === durableHash
        ? { kind: 'recoverable', draft }
        : { kind: 'stale', draft };
    },

    remove(studioId, path) {
      try {
        storage.removeItem(storageKey(studioId, path));
        return true;
      } catch {
        return false;
      }
    },

    write(record) {
      try {
        storage.setItem(
          storageKey(record.studioId, record.path),
          JSON.stringify(record),
        );
        return true;
      } catch {
        return false;
      }
    },
  };
}
