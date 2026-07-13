import {
  createStudioControlVault,
  type StudioControlVault,
  type VaultPort,
} from '@studio/storage';

const ACTIVE_PATH = '.studio/season/active.json';
const CLOSE_JOURNAL_PATH = '.studio/season/close-journal.json';

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

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function parseActive(text: string): SeasonActiveCheckpoint {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    const operation = value.operation;
    if (
      value.version !== 1 ||
      typeof value.revision !== 'number' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0 ||
      !isStringOrNull(value.activeNoteId) ||
      !isStringOrNull(value.activePath) ||
      (value.activeNoteId === null) !== (value.activePath === null) ||
      !(
        operation === null ||
        (typeof operation === 'object' &&
          !Array.isArray(operation) &&
          operation !== null &&
          typeof (operation as Record<string, unknown>).id === 'string' &&
          ['activating', 'repairing', 'closing'].includes(
            String((operation as Record<string, unknown>).kind),
          ) &&
          typeof (operation as Record<string, unknown>).targetNoteId ===
            'string' &&
          typeof (operation as Record<string, unknown>).targetPath === 'string')
      )
    ) {
      throw new Error('invalid shape');
    }
    return value as unknown as SeasonActiveCheckpoint;
  } catch (error) {
    throw new Error(
      'The active-season checkpoint is unreadable and needs explicit repair.',
      { cause: error },
    );
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
