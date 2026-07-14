import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import {
  PathEscapeError,
  VaultConflictError,
  VaultUnavailableError,
} from './conflict';
import type {
  VaultChange,
  VaultEntry,
  VaultPort,
  WriteCondition,
} from './vault-port';

export interface TauriVaultBridge {
  invoke(
    command: string,
    args: Record<string, unknown> | number[] | ArrayBuffer | Uint8Array,
    options?: { headers: HeadersInit },
  ): Promise<unknown>;
  listen(
    event: string,
    listener: (payload: unknown) => void,
  ): Promise<() => void>;
}

const defaultBridge: TauriVaultBridge = {
  invoke: (command, args, options) => invoke(command, args, options),
  listen: async (event, listener) => {
    const stop = await listen(event, ({ payload }) => listener(payload));
    return stop;
  },
};

function translate(error: unknown): never {
  if (
    error instanceof PathEscapeError ||
    error instanceof VaultConflictError ||
    error instanceof VaultUnavailableError
  )
    throw error;
  const code =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : '';
  if (code.includes('path_escape')) throw new PathEscapeError();
  if (code.includes('conflict')) throw new VaultConflictError();
  throw new VaultUnavailableError();
}

type VaultToken = string & { readonly __vaultToken: unique symbol };

export interface TauriVault extends VaultPort {
  /** Stable opaque scope for editor recovery. It never contains the selected folder path. */
  recoveryIdentity: string;
}

export type TauriBackupSaveStatus = 'cancelled' | 'saved';

export async function saveTauriVaultBackup(
  bytes: Uint8Array,
  suggestedFileName: string,
  bridge: TauriVaultBridge = defaultBridge,
): Promise<TauriBackupSaveStatus> {
  if (
    bytes.byteLength > 512 * 1024 * 1024 ||
    bytes.byteLength < 4 ||
    ![0x50, 0x4b, 0x03, 0x04].every((byte, index) => bytes[index] === byte) ||
    suggestedFileName.length === 0 ||
    suggestedFileName.length > 160 ||
    suggestedFileName.includes('/') ||
    suggestedFileName.includes('\\') ||
    !suggestedFileName.toLocaleLowerCase('en').endsWith('.zip')
  ) {
    throw new VaultUnavailableError();
  }
  let response: unknown;
  try {
    response = await bridge.invoke('backup_save_zip', bytes, {
      headers: {
        'x-studio-backup-name': encodeURIComponent(suggestedFileName),
      },
    });
  } catch (error) {
    translate(error);
  }
  if (response !== 'cancelled' && response !== 'saved') {
    throw new VaultUnavailableError();
  }
  return response;
}

function createTauriVault(
  vaultToken: VaultToken,
  recoveryIdentity: string,
  bridge: TauriVaultBridge,
): TauriVault {
  const call = async <T>(
    command: string,
    args: Record<string, unknown>,
  ): Promise<T> => {
    try {
      return (await bridge.invoke(command, { vaultToken, ...args })) as T;
    } catch (error) {
      translate(error);
    }
  };
  return {
    recoveryIdentity,
    list: (prefix) => call<VaultEntry[]>('vault_list', { prefix }),
    readText: (path) => call('vault_read_text', { path }),
    writeTextAtomic: (path, text, condition?: WriteCondition) =>
      call('vault_write_text_atomic', {
        path,
        text,
        expectedHash: condition?.expectedHash,
        expectedMissing: condition?.expectedMissing,
      }),
    readBinary: async (path) =>
      new Uint8Array(await call<number[]>('vault_read_binary', { path })),
    writeBinaryAtomic: (path, bytes, condition?: WriteCondition) =>
      call('vault_write_binary_atomic', {
        path,
        bytes: [...bytes],
        expectedHash: condition?.expectedHash,
        expectedMissing: condition?.expectedMissing,
      }),
    move: (from, to, condition) =>
      call('vault_move', {
        from,
        to,
        expectedHash: condition?.expectedHash,
        expectedUserState: condition?.expectedUserState,
      }),
    remove: (path, condition?: WriteCondition) =>
      call('vault_remove', {
        path,
        expectedHash: condition?.expectedHash,
        expectedMissing: condition?.expectedMissing,
      }),
    exists: (path) => call('vault_exists', { path }),
    watch: async (listener) => {
      const registration = await call<{ id: string; event: string }>(
        'vault_watch',
        {},
      );
      let stopListening: () => void;
      try {
        stopListening = await bridge.listen(registration.event, (payload) =>
          listener(payload as VaultChange),
        );
      } catch (error) {
        await call('vault_unwatch', { id: registration.id }).catch(
          () => undefined,
        );
        throw error;
      }
      return () => {
        stopListening();
        void call('vault_unwatch', { id: registration.id });
      };
    },
  };
}

export async function selectTauriVault(
  bridge: TauriVaultBridge = defaultBridge,
): Promise<TauriVault | null> {
  let selection: unknown;
  try {
    selection = await bridge.invoke('vault_select', {});
  } catch (error) {
    translate(error);
  }
  if (selection === null) return null;
  if (
    typeof selection !== 'object' ||
    selection === null ||
    typeof (selection as { vaultToken?: unknown }).vaultToken !== 'string' ||
    (selection as { vaultToken: string }).vaultToken.length < 32 ||
    typeof (selection as { recoveryIdentity?: unknown }).recoveryIdentity !==
      'string' ||
    !/^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(
      (selection as { recoveryIdentity: string }).recoveryIdentity,
    )
  ) {
    throw new VaultUnavailableError();
  }
  return createTauriVault(
    (selection as { vaultToken: string }).vaultToken as VaultToken,
    (selection as { recoveryIdentity: string }).recoveryIdentity,
    bridge,
  );
}
