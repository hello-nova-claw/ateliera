import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import {
  PathEscapeError,
  VaultConflictError,
  VaultUnavailableError,
} from './conflict';
import type {
  VaultAtomicWriteBatch,
  VaultAtomicWriteResult,
  VaultChange,
  VaultEntry,
  VaultPort,
  WriteCondition,
} from './vault-port';

const BATCH_MAGIC = new TextEncoder().encode('STUDIOB1');
const encoder = new TextEncoder();

function uint32(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new VaultUnavailableError();
  }
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function joinBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  if (!Number.isSafeInteger(size) || size > 512 * 1024 * 1024) {
    throw new VaultUnavailableError();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function field(value: string): readonly [Uint8Array, Uint8Array] {
  const bytes = encoder.encode(value);
  return [uint32(bytes.byteLength), bytes];
}

function encodeBatch(
  input: VaultAtomicWriteBatch,
  expectedUserState: WriteCondition['expectedUserState'],
): Uint8Array {
  const chunks: Uint8Array[] = [BATCH_MAGIC, ...field(input.expectedRevision)];
  const state = expectedUserState ?? [];
  chunks.push(new Uint8Array([expectedUserState === undefined ? 0 : 1]), uint32(state.length));
  for (const entry of state) chunks.push(...field(entry.path), ...field(entry.hash));
  chunks.push(uint32(input.writes.length));
  for (const write of input.writes) {
    const flags = (write.expectedMissing ? 1 : 0) | (write.expectedHash === undefined ? 0 : 2);
    chunks.push(...field(write.path), new Uint8Array([flags]));
    if (write.expectedHash !== undefined) chunks.push(...field(write.expectedHash));
    chunks.push(uint32(write.bytes.byteLength), write.bytes);
  }
  return joinBytes(chunks);
}

function validRevision(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value) && value.length <= 20;
}

function validateBatchResult(
  value: unknown,
  expected: VaultAtomicWriteBatch,
): VaultAtomicWriteResult {
  if (value === null || typeof value !== 'object') throw new VaultUnavailableError();
  const candidate = value as { revision?: unknown; results?: unknown };
  if (!validRevision(candidate.revision) || !Array.isArray(candidate.results) ||
    candidate.results.length !== expected.writes.length) throw new VaultUnavailableError();
  const results = candidate.results.map((result, index) => {
    if (result === null || typeof result !== 'object') throw new VaultUnavailableError();
    const item = result as { path?: unknown; hash?: unknown };
    const expectedPath = expected.writes[index]?.path;
    if (expectedPath === undefined || item.path !== expectedPath || typeof item.hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(item.hash)) throw new VaultUnavailableError();
    return { path: expectedPath, hash: item.hash };
  });
  return { revision: candidate.revision, results };
}

export interface TauriVaultBridge {
  invoke(
    command: string,
    args: Record<string, unknown>,
    options?: { headers: HeadersInit },
  ): Promise<unknown>;
  listen(
    event: string,
    listener: (payload: unknown) => void,
  ): Promise<() => void>;
}

function invokeRaw(
  bridge: TauriVaultBridge,
  command: string,
  bytes: Uint8Array,
  headers: HeadersInit,
): Promise<unknown> {
  const invoke = bridge.invoke as unknown as (
    command: string,
    body: Uint8Array,
    options: { headers: HeadersInit },
  ) => Promise<unknown>;
  return invoke(command, bytes, { headers });
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
    response = await invokeRaw(bridge, 'backup_save_zip', bytes, {
        'x-studio-backup-name': encodeURIComponent(suggestedFileName),
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
  const getRevision = async (): Promise<string> => {
    const revision = await call<unknown>('vault_get_revision', {});
    if (!validRevision(revision)) throw new VaultUnavailableError();
    return revision;
  };
  const writeBatch = async (
    input: VaultAtomicWriteBatch,
    expectedUserState?: WriteCondition['expectedUserState'],
  ): Promise<VaultAtomicWriteResult> => {
    let response: unknown;
    try {
      response = await invokeRaw(
        bridge,
        'vault_write_batch_atomic',
        encodeBatch(input, expectedUserState),
        { 'x-studio-vault-token': vaultToken },
      );
    } catch (error) {
      translate(error);
    }
    return validateBatchResult(response, input);
  };
  return {
    recoveryIdentity,
    getRevision,
    list: (prefix) => call<VaultEntry[]>('vault_list', { prefix }),
    readText: (path) => call('vault_read_text', { path }),
    writeTextAtomic: (path, text, condition?: WriteCondition) =>
      call('vault_write_text_atomic', {
        path,
        text,
        expectedHash: condition?.expectedHash,
        expectedMissing: condition?.expectedMissing,
        expectedUserState: condition?.expectedUserState,
      }),
    readBinary: async (path) => {
      const response = await call<unknown>('vault_read_binary', { path });
      if (response instanceof Uint8Array) return response.slice();
      if (response instanceof ArrayBuffer) return new Uint8Array(response.slice(0));
      throw new VaultUnavailableError();
    },
    writeBinaryAtomic: async (path, bytes, condition?: WriteCondition) => {
      const snapshot = bytes.slice();
      const expectedUserState = condition?.expectedUserState?.map((entry) => ({ ...entry }));
      const result = await writeBatch({
        expectedRevision: await getRevision(),
        writes: [{
          path,
          bytes: snapshot,
          ...(condition?.expectedHash === undefined
            ? {} : { expectedHash: condition.expectedHash }),
          ...(condition?.expectedMissing ? { expectedMissing: true as const } : {}),
        }],
      }, expectedUserState);
      const written = result.results[0];
      if (written === undefined) throw new VaultUnavailableError();
      return { hash: written.hash };
    },
    writeBatchAtomic: (input) => writeBatch(input),
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
        expectedUserState: condition?.expectedUserState,
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
