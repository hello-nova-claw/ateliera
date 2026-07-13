import { describe, expect, it, vi } from 'vitest';

import {
  PathEscapeError,
  VaultConflictError,
  VaultUnavailableError,
} from './conflict';
import { selectTauriVault, type TauriVaultBridge } from './tauri-vault';
import { createStudioControlVault } from './studio-control-vault';

const token = '0123456789abcdef0123456789abcdef';
const recoveryIdentity = 'fedcba9876544abc8edcba9876543210';

function selection(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { vaultToken: token, recoveryIdentity, ...overrides };
}

function bridge(
  invoke: TauriVaultBridge['invoke'],
  listen: TauriVaultBridge['listen'] = async () => () => undefined,
): TauriVaultBridge {
  return { invoke, listen };
}

describe('Tauri vault IPC adapter', () => {
  it('returns null when native folder selection is cancelled', async () => {
    const invoke = vi.fn(async () => null);
    await expect(selectTauriVault(bridge(invoke))).resolves.toBeNull();
    expect(invoke).toHaveBeenCalledWith('vault_select', {});
  });

  it('uses only the opaque native token for subsequent commands', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'vault_select') return selection();
      if (command === 'vault_read_text') return { text: 'hello', hash: 'hash' };
      throw new Error(`Unexpected command: ${command}`);
    });
    const vault = await selectTauriVault(bridge(invoke));
    expect(vault?.recoveryIdentity).toBe(recoveryIdentity);
    await expect(vault?.readText('note.md')).resolves.toEqual({
      text: 'hello',
      hash: 'hash',
    });
    expect(invoke).toHaveBeenLastCalledWith('vault_read_text', {
      vaultToken: token,
      path: 'note.md',
    });
    expect(JSON.stringify(invoke.mock.calls)).not.toContain('/selected-vault');
  });

  it('rejects malformed selection responses', async () => {
    await expect(
      selectTauriVault(
        bridge(async () => selection({ vaultToken: '/Users/forged' })),
      ),
    ).rejects.toBeInstanceOf(VaultUnavailableError);
    await expect(
      selectTauriVault(
        bridge(async () => selection({ recoveryIdentity: '/Users/forged' })),
      ),
    ).rejects.toBeInstanceOf(VaultUnavailableError);
  });

  it('transmits conditional text, binary, and remove operations', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'vault_select') return selection();
      if (command.startsWith('vault_write_')) return { hash: 'next' };
      if (command === 'vault_remove') return undefined;
      throw new Error(`Unexpected command: ${command}`);
    });
    const vault = await selectTauriVault(bridge(invoke));

    await vault?.writeTextAtomic('note.md', 'text', { expectedMissing: true });
    expect(invoke).toHaveBeenLastCalledWith('vault_write_text_atomic', {
      vaultToken: token,
      path: 'note.md',
      text: 'text',
      expectedHash: undefined,
      expectedMissing: true,
    });
    await vault?.writeBinaryAtomic('asset.bin', new Uint8Array([1, 2]), {
      expectedHash: 'binary-hash',
      expectedMissing: true,
    });
    expect(invoke).toHaveBeenLastCalledWith('vault_write_binary_atomic', {
      vaultToken: token,
      path: 'asset.bin',
      bytes: [1, 2],
      expectedHash: 'binary-hash',
      expectedMissing: true,
    });
    await vault?.remove('asset.bin', {
      expectedHash: 'remove-hash',
      expectedMissing: true,
    });
    expect(invoke).toHaveBeenLastCalledWith('vault_remove', {
      vaultToken: token,
      path: 'asset.bin',
      expectedHash: 'remove-hash',
      expectedMissing: true,
    });
  });

  it('routes lifecycle control paths only through the trusted boundary', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'vault_select') return selection();
      if (command === 'vault_write_text_atomic') return { hash: 'manifest-hash' };
      if (command === 'vault_move') return undefined;
      throw new Error(`Unexpected command: ${command}`);
    });
    const vault = await selectTauriVault(bridge(invoke));
    const control = createStudioControlVault(vault!);
    await control.writeTextAtomic('.studio/Trash/manifest.json', '{}', { expectedMissing: true });
    expect(invoke).toHaveBeenLastCalledWith('vault_write_text_atomic', {
      vaultToken: token,
      path: '.studio/Trash/manifest.json',
      text: '{}',
      expectedHash: undefined,
      expectedMissing: true,
    });
    await control.moveInto('Notes/a.md', '.studio/Trash/items/a/a.md');
    expect(invoke).toHaveBeenLastCalledWith('vault_move', {
      vaultToken: token,
      from: 'Notes/a.md',
      to: '.studio/Trash/items/a/a.md',
      expectedHash: undefined,
    });
    await control.moveInto('Notes/b.md', '.studio/Trash/items/b/b.md', {
      expectedHash: 'current-hash',
    });
    expect(invoke).toHaveBeenLastCalledWith('vault_move', {
      vaultToken: token,
      from: 'Notes/b.md',
      to: '.studio/Trash/items/b/b.md',
      expectedHash: 'current-hash',
    });
  });

  it.each([
    ['path_escape', PathEscapeError],
    ['conflict', VaultConflictError],
    ['unavailable', VaultUnavailableError],
  ] as const)('maps native %s errors', async (code, ErrorType) => {
    const vault = await selectTauriVault(
      bridge(async (command) => {
        if (command === 'vault_select') return selection();
        throw code;
      }),
    );
    await expect(vault?.readText('note.md')).rejects.toBeInstanceOf(ErrorType);
  });

  it('subscribes to the opaque event and unregisters the native watcher', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'vault_select') return selection();
      if (command === 'vault_watch')
        return { id: 'watch-id', event: 'studio-vault-random' };
      if (command === 'vault_unwatch') return undefined;
      throw new Error(`Unexpected command: ${command}`);
    });
    let receive: ((payload: unknown) => void) | undefined;
    const stopListening = vi.fn();
    const listen = vi.fn(
      async (_event: string, listener: (payload: unknown) => void) => {
        receive = listener;
        return stopListening;
      },
    );
    const vault = await selectTauriVault(bridge(invoke, listen));
    const onChange = vi.fn();
    const stop = await vault?.watch(onChange);
    receive?.({ kind: 'created', path: 'note.md', hash: 'hash' });
    expect(onChange).toHaveBeenCalledWith({
      kind: 'created',
      path: 'note.md',
      hash: 'hash',
    });
    stop?.();
    expect(stopListening).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenLastCalledWith('vault_unwatch', {
      vaultToken: token,
      id: 'watch-id',
    });
  });

  it('unregisters the native watcher when event subscription fails', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'vault_select') return selection();
      if (command === 'vault_watch')
        return { id: 'watch-id', event: 'studio-vault-random' };
      if (command === 'vault_unwatch') return undefined;
      throw new Error(`Unexpected command: ${command}`);
    });
    const listenError = new Error('listener unavailable');
    const vault = await selectTauriVault(
      bridge(invoke, async () => {
        throw listenError;
      }),
    );

    await expect(vault?.watch(vi.fn())).rejects.toBe(listenError);
    expect(invoke).toHaveBeenLastCalledWith('vault_unwatch', {
      vaultToken: token,
      id: 'watch-id',
    });
  });
});
