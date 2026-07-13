import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { PathEscapeError, VaultConflictError, VaultUnavailableError } from './conflict';
import type { VaultChange, VaultEntry, VaultPort, WriteCondition } from './vault-port';

export interface TauriVaultBridge {
  invoke(command: string, args: Record<string, unknown>): Promise<unknown>;
  listen(event: string, listener: (payload: unknown) => void): Promise<() => void>;
}

const defaultBridge: TauriVaultBridge = {
  invoke,
  listen: async (event, listener) => {
    const stop = await listen(event, ({ payload }) => listener(payload));
    return stop;
  },
};

function translate(error: unknown): never {
  if (error instanceof PathEscapeError || error instanceof VaultConflictError || error instanceof VaultUnavailableError) throw error;
  const code = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  if (code.includes('path_escape')) throw new PathEscapeError();
  if (code.includes('conflict')) throw new VaultConflictError();
  throw new VaultUnavailableError();
}

export function createTauriVault(rootToken: string, bridge: TauriVaultBridge = defaultBridge): VaultPort {
  const call = async <T>(command: string, args: Record<string, unknown>): Promise<T> => {
    try { return await bridge.invoke(command, { rootToken, ...args }) as T; } catch (error) { translate(error); }
  };
  return {
    list: (prefix) => call<VaultEntry[]>('vault_list', { prefix }),
    readText: (path) => call('vault_read_text', { path }),
    writeTextAtomic: (path, text, condition?: WriteCondition) => call('vault_write_text_atomic', { path, text, expectedHash: condition?.expectedHash }),
    readBinary: async (path) => new Uint8Array(await call<number[]>('vault_read_binary', { path })),
    writeBinaryAtomic: (path, bytes) => call('vault_write_binary_atomic', { path, bytes: [...bytes] }),
    move: (from, to) => call('vault_move', { from, to }),
    remove: (path) => call('vault_remove', { path }),
    exists: (path) => call('vault_exists', { path }),
    watch: async (listener) => {
      const registration = await call<{ id: string; event: string }>('vault_watch', {});
      const stopListening = await bridge.listen(registration.event, (payload) => listener(payload as VaultChange));
      return () => { stopListening(); void call('vault_unwatch', { id: registration.id }); };
    },
  };
}
