import {
  createStudioControlVault,
  type StudioControlVault,
  type VaultPort,
} from '@studio/storage/portable';

const ACTIVE_PATH = '.studio/season/active.json';
const CLOSE_JOURNAL_PATH = '.studio/season/close-journal.json';
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:/u;
const UNSAFE_IDENTIFIER_CHARACTER = new RegExp(
  String.raw`[\u0000-\u001f\u007f-\u009f/\\]`,
  'u',
);

export type SeasonActiveOperationKind = 'activating' | 'repairing' | 'closing';

export interface SeasonActiveOperation {
  id: string;
  kind: SeasonActiveOperationKind;
  targetNoteId: string;
  targetPath: string;
}

export interface SeasonActiveCheckpoint {
  version: 1;
  revision: number;
  activeNoteId: string | null;
  activePath: string | null;
  operation: SeasonActiveOperation | null;
}

export interface VersionedSeasonRecord<Value> {
  value: Value;
  hash: string | null;
}

export interface SeasonTransactionStore {
  readActive(): Promise<VersionedSeasonRecord<SeasonActiveCheckpoint>>;
  compareAndSetActive(
    observed: VersionedSeasonRecord<SeasonActiveCheckpoint>,
    next: SeasonActiveCheckpoint,
  ): Promise<VersionedSeasonRecord<SeasonActiveCheckpoint>>;
  readCloseJournal(): Promise<
    VersionedSeasonRecord<Record<string, unknown> | null>
  >;
  compareAndSetCloseJournal(
    observed: VersionedSeasonRecord<Record<string, unknown> | null>,
    next: Record<string, unknown>,
  ): Promise<VersionedSeasonRecord<Record<string, unknown>>>;
  removeCloseJournal(
    observed: VersionedSeasonRecord<Record<string, unknown>>,
  ): Promise<void>;
}

export function emptySeasonActiveCheckpoint(): SeasonActiveCheckpoint {
  return {
    version: 1,
    revision: 0,
    activeNoteId: null,
    activePath: null,
    operation: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    keys.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function isWellFormedUnicode(value: string): boolean {
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

function isCanonicalIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value === value.trim() &&
    value === value.normalize('NFC') &&
    value !== '.' &&
    value !== '..' &&
    !UNSAFE_IDENTIFIER_CHARACTER.test(value) &&
    isWellFormedUnicode(value)
  );
}

function isCanonicalUserPath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.normalize('NFC') ||
    value !== value.trim() ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    WINDOWS_DRIVE_PATH.test(value) ||
    !isWellFormedUnicode(value)
  ) {
    return false;
  }
  return value.split('/').every((segment) => {
    const folded = segment.toLocaleLowerCase('en');
    return (
      segment.length > 0 &&
      segment === segment.trim() &&
      segment !== '.' &&
      segment !== '..' &&
      folded !== '.studio' &&
      !folded.startsWith('.studio-')
    );
  });
}

function isActiveOperation(
  value: unknown,
  activeNoteId: string,
  activePath: string,
): value is SeasonActiveOperation {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['id', 'kind', 'targetNoteId', 'targetPath']) ||
    !isCanonicalIdentifier(value.id) ||
    !['activating', 'repairing', 'closing'].includes(String(value.kind)) ||
    !isCanonicalIdentifier(value.targetNoteId) ||
    !isCanonicalUserPath(value.targetPath)
  ) {
    return false;
  }
  return value.targetNoteId === activeNoteId && value.targetPath === activePath;
}

function isActiveCheckpoint(value: unknown): value is SeasonActiveCheckpoint {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'version',
      'revision',
      'activeNoteId',
      'activePath',
      'operation',
    ]) ||
    value.version !== 1 ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  ) {
    return false;
  }

  const hasNoActiveSeason =
    value.activeNoteId === null && value.activePath === null;
  if (hasNoActiveSeason) return value.operation === null;
  if (
    !isCanonicalIdentifier(value.activeNoteId) ||
    !isCanonicalUserPath(value.activePath)
  ) {
    return false;
  }
  return (
    value.operation === null ||
    isActiveOperation(value.operation, value.activeNoteId, value.activePath)
  );
}

function invalidActiveCheckpoint(error?: unknown): Error {
  return new Error(
    'The active-season checkpoint is unreadable and needs explicit repair.',
    error === undefined ? undefined : { cause: error },
  );
}

function parseActive(text: string): SeasonActiveCheckpoint {
  try {
    const value = JSON.parse(text) as unknown;
    if (!isActiveCheckpoint(value)) throw new Error('invalid shape');
    return value;
  } catch (error) {
    throw invalidActiveCheckpoint(error);
  }
}

function json(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readOptional(
  control: StudioControlVault,
  path: string,
): Promise<{ text: string; hash: string } | null> {
  if (!(await control.exists(path))) return null;
  return control.readText(path);
}

export function createSeasonTransactionStore(
  vault: VaultPort,
): SeasonTransactionStore {
  const control = createStudioControlVault(vault);
  return {
    async readActive() {
      const file = await readOptional(control, ACTIVE_PATH);
      return file === null
        ? { value: emptySeasonActiveCheckpoint(), hash: null }
        : { value: parseActive(file.text), hash: file.hash };
    },

    async compareAndSetActive(observed, next) {
      if (!isActiveCheckpoint(observed.value)) throw invalidActiveCheckpoint();
      if (!isActiveCheckpoint(next)) throw invalidActiveCheckpoint();
      if (next.revision !== observed.value.revision + 1) {
        throw new Error(
          'The active-season checkpoint revision must advance once.',
        );
      }
      const result = await control.writeTextAtomic(
        ACTIVE_PATH,
        json(next),
        observed.hash === null
          ? { expectedMissing: true }
          : { expectedHash: observed.hash },
      );
      return { value: next, hash: result.hash };
    },

    async readCloseJournal() {
      const file = await readOptional(control, CLOSE_JOURNAL_PATH);
      if (file === null) return { value: null, hash: null };
      try {
        const value = JSON.parse(file.text) as unknown;
        if (
          typeof value !== 'object' ||
          value === null ||
          Array.isArray(value)
        ) {
          throw new Error('invalid shape');
        }
        return {
          value: value as Record<string, unknown>,
          hash: file.hash,
        };
      } catch (error) {
        throw new Error(
          'The season-close journal is unreadable and needs explicit repair.',
          { cause: error },
        );
      }
    },

    async compareAndSetCloseJournal(observed, next) {
      const result = await control.writeTextAtomic(
        CLOSE_JOURNAL_PATH,
        json(next),
        observed.hash === null
          ? { expectedMissing: true }
          : { expectedHash: observed.hash },
      );
      return { value: next, hash: result.hash };
    },

    async removeCloseJournal(observed) {
      if (observed.hash === null) {
        throw new Error('The season-close journal revision is missing.');
      }
      await control.remove(CLOSE_JOURNAL_PATH, {
        expectedHash: observed.hash,
      });
    },
  };
}
