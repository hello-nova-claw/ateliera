import {
  createBrowserVault,
  type BrowserVaultStore,
  type StoredBrowserFile,
} from '@studio/storage/browser';
import { selectTauriVault, type TauriVaultBridge } from '@studio/storage/tauri';
import type { VaultPort } from '@studio/storage/portable';
import { describe, expect, it } from 'vitest';

import { createSeasonTransactionStore } from './season-transaction-store';

function browserStore(): BrowserVaultStore {
  const files = new Map<string, StoredBrowserFile>();
  return {
    async entries() {
      return [...files.entries()];
    },
    async read(path) {
      return files.get(path);
    },
    async write(path, file) {
      files.set(path, { ...file, bytes: file.bytes.slice() });
    },
    async remove(path) {
      files.delete(path);
    },
  };
}

function nativeBridge(): TauriVaultBridge {
  const files = new Map<string, { text: string; hash: string }>();
  let revision = 0;
  return {
    async listen() {
      return () => undefined;
    },
    async invoke(command, args) {
      if (command === 'vault_select') {
        return {
          vaultToken: '0123456789abcdef0123456789abcdef',
          recoveryIdentity: 'fedcba9876544abc8edcba9876543210',
        };
      }
      const path = String(args.path ?? args.prefix ?? '');
      if (command === 'vault_exists') return files.has(path);
      if (command === 'vault_read_text') {
        const file = files.get(path);
        if (file === undefined) throw new Error('unavailable');
        return file;
      }
      if (command === 'vault_write_text_atomic') {
        const current = files.get(path);
        if (
          (args.expectedMissing === true && current !== undefined) ||
          (typeof args.expectedHash === 'string' &&
            current?.hash !== args.expectedHash)
        ) {
          throw new Error('conflict');
        }
        revision += 1;
        const written = {
          text: String(args.text),
          hash: `native-${revision}`,
        };
        files.set(path, written);
        return { hash: written.hash };
      }
      throw new Error(`Unexpected native command: ${command}`);
    },
  };
}

async function expectExactActiveWinner(
  firstVault: VaultPort,
  secondVault: VaultPort,
) {
  const first = createSeasonTransactionStore(firstVault);
  const second = createSeasonTransactionStore(secondVault);
  const [left, right] = await Promise.all([
    first.readActive(),
    second.readActive(),
  ]);
  const claim = (noteId: string) => ({
    version: 1 as const,
    revision: 1,
    activeNoteId: noteId,
    activePath: `Current Season/${noteId}.md`,
    operation: {
      id: `activate-${noteId}`,
      kind: 'activating' as const,
      targetNoteId: noteId,
      targetPath: `Current Season/${noteId}.md`,
    },
  });
  const results = await Promise.allSettled([
    first.compareAndSetActive(left, claim('winter')),
    second.compareAndSetActive(right, claim('spring')),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  const reopened = createSeasonTransactionStore(firstVault);
  expect((await reopened.readActive()).value).toMatchObject({
    activeNoteId: expect.stringMatching(/^(winter|spring)$/u),
    operation: { kind: 'activating' },
  });
}

describe('season checkpoint production adapters', () => {
  it('coordinates independent browser vault instances and survives reopen', async () => {
    const store = browserStore();
    await expectExactActiveWinner(
      createBrowserVault('season-browser', { store }),
      createBrowserVault('season-browser', { store }),
    );
  });

  it('coordinates independent native selections and survives reopen', async () => {
    const bridge = nativeBridge();
    const first = await selectTauriVault(bridge);
    const second = await selectTauriVault(bridge);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    await expectExactActiveWinner(first!, second!);
  });
});
