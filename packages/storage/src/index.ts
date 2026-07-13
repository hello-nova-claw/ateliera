export { PathEscapeError, VaultConflictError, VaultUnavailableError } from './conflict';
export { createInMemoryVault } from './in-memory-vault';
export {
  createBrowserVault,
  exportBrowserVault,
  importBrowserVault,
} from './browser-vault';
export type {
  BrowserVaultOptions,
  BrowserVaultStore,
  StoredBrowserFile,
} from './browser-vault';
export { selectTauriVault } from './tauri-vault';
export type {
  VaultChange,
  VaultEntry,
  VaultPort,
  WriteCondition,
} from './vault-port';
