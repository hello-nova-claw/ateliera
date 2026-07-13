export { PathEscapeError, VaultConflictError, VaultUnavailableError } from './conflict';
export { createInMemoryVault } from './in-memory-vault';
export { createTauriVault } from './tauri-vault';
export type {
  VaultChange,
  VaultEntry,
  VaultPort,
  WriteCondition,
} from './vault-port';
