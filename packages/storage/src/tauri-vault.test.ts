import { describe, expect, it, vi } from 'vitest';

import {
  PathEscapeError,
  VaultConflictError,
  VaultUnavailableError,
} from './conflict';
import {
  saveTauriVaultBackup,
  selectTauriVault,
  type TauriVaultBridge,
} from './tauri-vault';
import { createStudioControlVault } from './studio-control-vault';

const token = '0123456789abcdef0123456789abcdef';
const recoveryIdentity = 'fedcba9876544abc8edcba9876543210';
const hash = 'a'.repeat(64);

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
  it('saves backup bytes through a path-private native destination picker', async () => {
    const invoke = vi.fn<TauriVaultBridge['invoke']>(async () => 'saved');
    const archive = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    await expect(saveTauriVaultBackup(
      archive,
      'the-studio-backup-2026-07-14.zip',
      bridge(invoke),
    )).resolves.toBe('saved');
    expect(invoke).toHaveBeenCalledWith('backup_save_zip', archive, {
      headers: {
        'x-studio-backup-name': 'the-studio-backup-2026-07-14.zip',
      },
    });
    expect(invoke.mock.calls[0]?.[1]).toBeInstanceOf(Uint8Array);
    expect(invoke.mock.calls[0]?.[1]).toBe(archive);
    expect(Array.isArray(invoke.mock.calls[0]?.[1])).toBe(false);
    expect(JSON.stringify(invoke.mock.calls)).not.toContain('/Users/');
  });

  it('accepts cancellation but rejects malformed native backup responses', async () => {
    await expect(saveTauriVaultBackup(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      'backup.zip',
      bridge(async () => 'cancelled'),
    )).resolves.toBe('cancelled');
    await expect(saveTauriVaultBackup(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      'backup.zip',
      bridge(async () => '/Users/private/backup.zip'),
    )).rejects.toBeInstanceOf(VaultUnavailableError);
  });

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
      if (command === 'vault_get_revision') return '1';
      if (command === 'vault_write_batch_atomic') {
        return { revision: '2', results: [{ path: 'asset.bin', hash }] };
      }
      if (command.startsWith('vault_write_')) return { hash: 'next' };
      if (command === 'vault_remove') return undefined;
      throw new Error(`Unexpected command: ${command}`);
    });
    const vault = await selectTauriVault(bridge(invoke));

    const expectedUserState = [{ path: 'Inbox/observed.md', hash: 'note-hash' }];
    await vault?.writeTextAtomic('note.md', 'text', {
      expectedMissing: true,
      expectedUserState,
    });
    expect(invoke).toHaveBeenLastCalledWith('vault_write_text_atomic', {
      vaultToken: token,
      path: 'note.md',
      text: 'text',
      expectedHash: undefined,
      expectedMissing: true,
      expectedUserState,
    });
    await vault?.writeBinaryAtomic('asset.bin', new Uint8Array([1, 2]), {
      expectedHash: 'binary-hash',
      expectedMissing: true,
      expectedUserState,
    });
    expect(invoke).toHaveBeenLastCalledWith('vault_write_batch_atomic', expect.any(Uint8Array), {
      headers: { 'x-studio-vault-token': token },
    });
    await vault?.remove('asset.bin', {
      expectedHash: 'remove-hash',
      expectedMissing: true,
      expectedUserState,
    });
    expect(invoke).toHaveBeenLastCalledWith('vault_remove', {
      vaultToken: token,
      path: 'asset.bin',
      expectedHash: 'remove-hash',
      expectedMissing: true,
      expectedUserState,
    });
  });

  it('uses raw IPC bytes for ordinary binary reads and writes', async () => {
    const invoke = vi.fn<TauriVaultBridge['invoke']>(async (command, args) => {
      if (command === 'vault_select') return selection();
      if (command === 'vault_get_revision') return '7';
      if (command === 'vault_write_batch_atomic') {
        return { revision: '8', results: [{ path: 'asset.bin', hash }] };
      }
      if (command === 'vault_list') {
        return [{ path: 'asset.bin', kind: 'file', size: 3, contentHash: hash }];
      }
      if (command === 'vault_read_binary_chunk') {
        expect(args).toMatchObject({ path: 'asset.bin', offset: 0, length: 3 });
        return new Uint8Array([4, 5, 6]);
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    const vault = await selectTauriVault(bridge(invoke));

    await expect(vault?.writeBinaryAtomic('asset.bin', new Uint8Array([1, 2, 3]), {
      expectedMissing: true,
    })).resolves.toEqual({ hash });
    const batchCall = invoke.mock.calls.find(([command]) => command === 'vault_write_batch_atomic');
    expect(batchCall?.[1]).toBeInstanceOf(Uint8Array);
    expect(Array.isArray(batchCall?.[1])).toBe(false);
    expect(batchCall?.[2]).toEqual({
      headers: { 'x-studio-vault-token': token },
    });
    await expect(vault?.readBinary('asset.bin')).resolves.toEqual(new Uint8Array([4, 5, 6]));
  });

  it('assembles attachments larger than 64 MiB through bounded raw chunks', async () => {
    const chunkBytes = 4 * 1024 * 1024;
    const size = 64 * 1024 * 1024 + 17;
    const invoke = vi.fn<TauriVaultBridge['invoke']>(async (command, args) => {
      if (command === 'vault_select') return selection();
      if (command === 'vault_list') {
        return [{ path: 'Attachments/large.bin', kind: 'file', size, contentHash: hash }];
      }
      if (command === 'vault_read_binary_chunk') {
        const request = args as { offset: number; length: number };
        expect(request.length).toBeLessThanOrEqual(chunkBytes);
        const length = Math.min(request.length, size - request.offset);
        return Uint8Array.from(
          { length },
          (_, index) => ((request.offset + index) * 31 + 7) % 251,
        );
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    const vault = await selectTauriVault(bridge(invoke));

    const bytes = await vault?.readBinary('Attachments/large.bin');

    expect(bytes?.byteLength).toBe(size);
    for (const index of [0, chunkBytes - 1, chunkBytes, 64 * 1024 * 1024, size - 1]) {
      expect(bytes?.[index]).toBe((index * 31 + 7) % 251);
    }
    const chunkCalls = invoke.mock.calls.filter(([command]) => command === 'vault_read_binary_chunk');
    expect(chunkCalls.length).toBeGreaterThan(16);
    expect(chunkCalls.every(([, args]) => (args as { length: number }).length <= chunkBytes)).toBe(true);
  });

  it('uses the strict bounded primitive for portability reads', async () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const invoke = vi.fn<TauriVaultBridge['invoke']>(async (command, args) => {
      if (command === 'vault_select') return selection();
      if (command === 'vault_read_binary_bounded') {
        if ((args as { path: string }).path.startsWith('..')) throw new Error('path_escape');
        expect(args).toEqual({ vaultToken: token, path: 'asset.bin', maxBytes: 64 * 1024 * 1024 });
        return bytes;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    const vault = await selectTauriVault(bridge(invoke));

    await expect(vault?.readBinaryBounded?.('asset.bin', 64 * 1024 * 1024)).resolves.toEqual({
      bytes,
      hash: '787c798e39a5bc1910355bae6d0cd87a36b2e10fd0202a83e3bb6b005da83472',
    });
    await expect(vault?.readBinaryBounded?.('../escape.bin', 1)).rejects.toBeInstanceOf(
      PathEscapeError,
    );
  });

  it('exposes monotonic revision and one raw atomic batch call', async () => {
    const invoke = vi.fn<TauriVaultBridge['invoke']>(async (command) => {
      if (command === 'vault_select') return selection();
      if (command === 'vault_get_revision') return '41';
      if (command === 'vault_write_batch_atomic') {
        return {
          revision: '42',
          results: [
            { path: 'Notes/a.md', hash },
            { path: 'Notes/b.md', hash },
          ],
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    const vault = await selectTauriVault(bridge(invoke));

    await expect(vault?.getRevision()).resolves.toBe('41');
    await expect(vault?.writeBatchAtomic({
      expectedRevision: '41',
      writes: [
        { path: 'Notes/a.md', bytes: new Uint8Array([1]), expectedMissing: true },
        { path: 'Notes/b.md', bytes: new Uint8Array([2]), expectedHash: 'old-b' },
      ],
    })).resolves.toEqual({
      revision: '42',
      results: [
        { path: 'Notes/a.md', hash },
        { path: 'Notes/b.md', hash },
      ],
    });
    const batchCalls = invoke.mock.calls.filter(([command]) => command === 'vault_write_batch_atomic');
    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]?.[1]).toBeInstanceOf(Uint8Array);
  });

  it('copies batch bytes before asynchronous native publication begins', async () => {
    let rawBody: unknown;
    const invoke = vi.fn<TauriVaultBridge['invoke']>(async (command, args) => {
      if (command === 'vault_select') return selection();
      if (command === 'vault_write_batch_atomic') {
        rawBody = args;
        await Promise.resolve();
        return { revision: '2', results: [{ path: 'asset.bin', hash }] };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    const vault = await selectTauriVault(bridge(invoke));
    const source = new Uint8Array([1, 2, 3]);
    const pending = vault?.writeBatchAtomic({
      expectedRevision: '1',
      writes: [{ path: 'asset.bin', bytes: source, expectedMissing: true }],
    });
    source.fill(9);
    await pending;

    expect(rawBody).toBeInstanceOf(Uint8Array);
    expect(Array.from((rawBody as Uint8Array).slice(-3))).toEqual([1, 2, 3]);
  });

  it('snapshots ordinary binary bytes before awaiting the native revision', async () => {
    let resolveRevision: ((revision: string) => void) | undefined;
    let rawBody: unknown;
    const revision = new Promise<string>((resolve) => { resolveRevision = resolve; });
    const invoke = vi.fn<TauriVaultBridge['invoke']>(async (command, args) => {
      if (command === 'vault_select') return selection();
      if (command === 'vault_get_revision') return revision;
      if (command === 'vault_write_batch_atomic') {
        rawBody = args;
        return { revision: '2', results: [{ path: 'asset.bin', hash }] };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    const vault = await selectTauriVault(bridge(invoke));
    const source = new Uint8Array([1, 2, 3]);
    const pending = vault?.writeBinaryAtomic('asset.bin', source, { expectedMissing: true });
    source.fill(9);
    resolveRevision?.('1');
    await pending;

    expect(Array.from((rawBody as Uint8Array).slice(-3))).toEqual([1, 2, 3]);
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
      expectedUserState: undefined,
    });
    await control.moveInto('Notes/b.md', '.studio/Trash/items/b/b.md', {
      expectedHash: 'current-hash',
      expectedUserState: [{ path: 'Notes/a.md', hash: 'note-hash' }],
    });
    expect(invoke).toHaveBeenLastCalledWith('vault_move', {
      vaultToken: token,
      from: 'Notes/b.md',
      to: '.studio/Trash/items/b/b.md',
      expectedHash: 'current-hash',
      expectedUserState: [{ path: 'Notes/a.md', hash: 'note-hash' }],
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
