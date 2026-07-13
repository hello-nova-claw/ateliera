import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { PathEscapeError, VaultConflictError, VaultUnavailableError } from '../conflict';
import type { VaultChange, VaultPort } from '../vault-port';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export function vaultContract(name: string, createVault: () => Promise<VaultPort>): void {
  describe(name, () => {
    it.each(['../secret.md', '/secret.md', '\\secret.md', 'C:\\secret.md', 'Inbox/../secret.md', 'Inbox\\secret.md', 'Inbox/\0secret.md'])(
      'rejects unsafe path %j',
      async (path) => {
        const vault = await createVault();

        await expect(vault.writeTextAtomic(path, 'x')).rejects.toBeInstanceOf(PathEscapeError);
      },
    );

    it.each(['', '.', './Inbox/a.md', 'Inbox//a.md', 'Inbox/./a.md', 'Inbox/a.md/'])(
      'rejects non-normalized path %j',
      async (path) => {
        const vault = await createVault();

        await expect(vault.exists(path)).rejects.toBeInstanceOf(PathEscapeError);
      },
    );

    it('prevents lost updates with expected hashes', async () => {
      const vault = await createVault();
      const first = await vault.writeTextAtomic('Inbox/a.md', 'one');
      await vault.writeTextAtomic('Inbox/a.md', 'two', { expectedHash: first.hash });

      await expect(
        vault.writeTextAtomic('Inbox/a.md', 'three', { expectedHash: first.hash }),
      ).rejects.toBeInstanceOf(VaultConflictError);
      await expect(vault.readText('Inbox/a.md')).resolves.toEqual({
        text: 'two',
        hash: sha256('two'),
      });
    });

    it('requires a missing file when expectedHash is absent', async () => {
      const vault = await createVault();

      await expect(
        vault.writeTextAtomic('Inbox/missing.md', 'one', { expectedHash: sha256('missing') }),
      ).rejects.toBeInstanceOf(VaultConflictError);
      await expect(vault.exists('Inbox/missing.md')).resolves.toBe(false);
    });

    it('allows only one concurrent writer to satisfy an expected hash', async () => {
      const vault = await createVault();
      const first = await vault.writeTextAtomic('Inbox/a.md', 'one');

      const results = await Promise.allSettled([
        vault.writeTextAtomic('Inbox/a.md', 'two', { expectedHash: first.hash }),
        vault.writeTextAtomic('Inbox/a.md', 'three', { expectedHash: first.hash }),
      ]);

      expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
      expect(results.find(({ status }) => status === 'rejected')).toMatchObject({
        reason: expect.any(VaultConflictError),
      });
    });

    it('hashes UTF-8 text with SHA-256 and reads it intact', async () => {
      const vault = await createVault();
      const text = 'Māori 🌿\n';

      await expect(vault.writeTextAtomic('Inbox/unicode.md', text)).resolves.toEqual({
        hash: sha256(text),
      });
      await expect(vault.readText('Inbox/unicode.md')).resolves.toEqual({
        text,
        hash: sha256(text),
      });
    });

    it('copies binary inputs and outputs across the adapter boundary', async () => {
      const vault = await createVault();
      const input = new Uint8Array([0, 1, 255]);
      const result = await vault.writeBinaryAtomic('Attachments/a.bin', input);
      input[0] = 99;
      const firstRead = await vault.readBinary('Attachments/a.bin');
      firstRead[1] = 99;

      expect(result.hash).toBe(createHash('sha256').update(new Uint8Array([0, 1, 255])).digest('hex'));
      await expect(vault.readBinary('Attachments/a.bin')).resolves.toEqual(new Uint8Array([0, 1, 255]));
    });

    it('lists entries deterministically by path and filters by prefix', async () => {
      const vault = await createVault();
      await vault.writeTextAtomic('Inbox/z.md', 'z');
      await vault.writeTextAtomic('Inbox/a.md', 'a');
      await vault.writeTextAtomic('Archive/b.md', 'b');

      const entries = await vault.list('Inbox');

      expect(entries.map(({ path }) => path)).toEqual(['Inbox', 'Inbox/a.md', 'Inbox/z.md']);
      expect(entries.find(({ path }) => path === 'Inbox/a.md')).toMatchObject({
        kind: 'file',
        size: 1,
        contentHash: sha256('a'),
      });
    });

    it('moves and removes complete values', async () => {
      const vault = await createVault();
      await vault.writeTextAtomic('Inbox/a.md', 'one');

      await vault.move('Inbox/a.md', 'Archive/a.md');

      await expect(vault.exists('Inbox/a.md')).resolves.toBe(false);
      await expect(vault.readText('Archive/a.md')).resolves.toEqual({ text: 'one', hash: sha256('one') });
      await vault.remove('Archive/a.md');
      await expect(vault.exists('Archive/a.md')).resolves.toBe(false);
    });

    it('uses typed unavailable errors for missing entries', async () => {
      const vault = await createVault();

      await expect(vault.readText('Inbox/missing.md')).rejects.toBeInstanceOf(VaultUnavailableError);
      await expect(vault.readBinary('Inbox/missing.bin')).rejects.toBeInstanceOf(VaultUnavailableError);
      await expect(vault.remove('Inbox/missing.md')).rejects.toBeInstanceOf(VaultUnavailableError);
    });

    it('emits watcher events after mutations are visible and stops after unsubscribe', async () => {
      const vault = await createVault();
      const events: VaultChange[] = [];
      const visibility: boolean[] = [];
      const stop = await vault.watch((event) => {
        events.push(event);
        void vault.exists(event.path).then((exists) => visibility.push(exists));
      });

      const written = await vault.writeTextAtomic('Inbox/a.md', 'one');
      await vi.waitFor(() => expect(visibility).toEqual([true]));
      await vault.move('Inbox/a.md', 'Archive/a.md');
      await vault.remove('Archive/a.md');
      stop();
      await vault.writeTextAtomic('Inbox/b.md', 'two');

      expect(events).toEqual([
        { kind: 'created', path: 'Inbox/a.md', hash: written.hash },
        { kind: 'moved', path: 'Archive/a.md', previousPath: 'Inbox/a.md', hash: written.hash },
        { kind: 'removed', path: 'Archive/a.md' },
      ]);
    });

    it('does not let watcher failures undo or reject a durable-equivalent mutation', async () => {
      const vault = await createVault();
      await vault.watch(() => {
        throw new Error('watcher failed');
      });

      await expect(vault.writeTextAtomic('Inbox/a.md', 'one')).resolves.toEqual({ hash: sha256('one') });
      await expect(vault.readText('Inbox/a.md')).resolves.toMatchObject({ text: 'one' });
    });
  });
}
