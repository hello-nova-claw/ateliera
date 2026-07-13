export { PathEscapeError, VaultConflictError, VaultUnavailableError } from './conflict';
export type { MoveCondition, VaultChange, VaultEntry, VaultPort, WriteCondition } from './vault-port';
export { createStudioControlVault } from './studio-control-vault';
export type { StudioControlVault } from './studio-control-vault';
export { createRevisionStore, RevisionLimitError } from './revisions';
export type {
  RevisionIdentity,
  RevisionLimits,
  RevisionReason,
  RevisionSnapshot,
  RevisionStore,
  RevisionStoreOptions,
} from './revisions';
