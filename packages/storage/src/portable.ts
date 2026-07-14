export { PathEscapeError, VaultConflictError, VaultUnavailableError } from './conflict';
export type {
  MoveCondition,
  VaultChange,
  VaultEntry,
  VaultPort,
  VaultUserStateEntry,
  WriteCondition,
} from './vault-port';
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
export { exportVault, PortableVaultError } from './export';
export type {
  ExportVaultOptions,
  PortableVaultErrorCode,
  PortableVaultManifest,
} from './export';
export { applyVaultImport, importVault, prepareVaultImport } from './import';
export type {
  ApplyVaultImportOptions,
  TargetFingerprintEntry,
  VaultImportAction,
  VaultImportItem,
  VaultImportPlan,
} from './import';
export {
  createVaultBackup,
  restoreVaultBackup,
  runWithPreMigrationBackup,
} from './backup';
export type {
  CreateVaultBackupOptions,
  PersistVaultBackup,
  VaultBackup,
  VaultBackupReason,
} from './backup';
