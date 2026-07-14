export { PathEscapeError, VaultConflictError, VaultUnavailableError } from './conflict';
export { createInMemoryVault } from './in-memory-vault';
export {
  createBrowserVault,
  ensureBrowserPersistence,
  exportBrowserVault,
  applyBrowserVaultImport,
  importBrowserVault,
  prepareBrowserVaultImport,
  VaultArchiveError,
} from './browser-vault';
export type {
  BrowserPersistenceStatus,
  BrowserVaultBackend,
  BrowserVaultEnvironment,
  BrowserVaultImportItem,
  BrowserVaultImportPlan,
  BrowserVaultOptions,
  BrowserVaultStore,
  StoredBrowserFile,
  VaultArchiveErrorCode,
} from './browser-vault';
export { saveTauriVaultBackup, selectTauriVault } from './tauri-vault';
export type { TauriBackupSaveStatus } from './tauri-vault';
export { createRevisionStore, RevisionLimitError } from './revisions';
export { createStudioControlVault } from './studio-control-vault';
export type { StudioControlVault } from './studio-control-vault';
export type {
  RevisionFile,
  RevisionIdentity,
  RevisionLimits,
  RevisionManifest,
  RevisionReason,
  RevisionSnapshot,
  RevisionStore,
  RevisionStoreOptions,
} from './revisions';
export type {
  VaultChange,
  VaultEntry,
  MoveCondition,
  VaultPort,
  WriteCondition,
} from './vault-port';
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
