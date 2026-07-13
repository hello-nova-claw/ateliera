import { describe, expect, it, vi } from 'vitest';

import { PathEscapeError, VaultConflictError, VaultUnavailableError } from './conflict';
import { selectTauriVault, type TauriVaultBridge } from './tauri-vault';

const token = '0123456789abcdef0123456789abcdef';

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
      if (command === 'vault_select') return { vaultToken: token };
      if (command === 'vault_read_text') return { text: 'hello', hash: 'hash' };
      throw new Error(`Unexpected command: ${command}`);
    });
    const vault = await selectTauriVault(bridge(invoke));
    await expect(vault?.readText('note.md')).resolves.toEqual({ text: 'hello', hash: 'hash' });
    expect(invoke).toHaveBeenLastCalledWith('vault_read_text', {
      vaultToken: token,
      path: 'note.md',
    });
    expect(JSON.stringify(invoke.mock.calls)).not.toContain('/selected-vault');
  });

  it('rejects malformed selection responses', async () => {
    await expect(
      selectTauriVault(bridge(async () => ({ vaultToken: '/Users/forged' }))),
    ).rejects.toBeInstanceOf(VaultUnavailableError);
  });

  it.each([
    ['path_escape', PathEscapeError],
    ['conflict', VaultConflictError],
    ['unavailable', VaultUnavailableError],
  ] as const)('maps native %s errors', async (code, ErrorType) => {
    const vault = await selectTauriVault(bridge(async (command) => {
      if (command === 'vault_select') return { vaultToken: token };
      throw code;
    }));
    await expect(vault?.readText('note.md')).rejects.toBeInstanceOf(ErrorType);
  });

  it('subscribes to the opaque event and unregisters the native watcher', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'vault_select') return { vaultToken: token };
      if (command === 'vault_watch') return { id: 'watch-id', event: 'studio-vault-random' };
      if (command === 'vault_unwatch') return undefined;
      throw new Error(`Unexpected command: ${command}`);
    });
    let receive: ((payload: unknown) => void) | undefined;
    const stopListening = vi.fn();
    const listen = vi.fn(async (_event: string, listener: (payload: unknown) => void) => {
      receive = listener;
      return stopListening;
    });
    const vault = await selectTauriVault(bridge(invoke, listen));
    const onChange = vi.fn();
    const stop = await vault?.watch(onChange);
    receive?.({ kind: 'created', path: 'note.md', hash: 'hash' });
    expect(onChange).toHaveBeenCalledWith({ kind: 'created', path: 'note.md', hash: 'hash' });
    stop?.();
    expect(stopListening).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenLastCalledWith('vault_unwatch', {
      vaultToken: token,
      id: 'watch-id',
    });
  });

  it('unregisters the native watcher when event subscription fails', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'vault_select') return { vaultToken: token };
      if (command === 'vault_watch') return { id: 'watch-id', event: 'studio-vault-random' };
      if (command === 'vault_unwatch') return undefined;
      throw new Error(`Unexpected command: ${command}`);
    });
    const listenError = new Error('listener unavailable');
    const vault = await selectTauriVault(bridge(invoke, async () => { throw listenError; }));

    await expect(vault?.watch(vi.fn())).rejects.toBe(listenError);
    expect(invoke).toHaveBeenLastCalledWith('vault_unwatch', {
      vaultToken: token,
      id: 'watch-id',
    });
  });
});
