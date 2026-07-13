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
export { selectTauriVault } from './tauri-vault';
export type {
  VaultChange,
  VaultEntry,
  VaultPort,
  WriteCondition,
} from './vault-port';
