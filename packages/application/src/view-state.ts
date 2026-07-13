import { VaultUnavailableError } from '@studio/storage/portable';
import type { VaultPort } from '@studio/storage/portable';

interface StoredViewOrder {
  version: 1;
  noteIds: string[];
}

export interface ViewStateRepository {
  load(viewKey: string): Promise<string[]>;
  save(viewKey: string, noteIds: string[]): Promise<void>;
}

function viewPath(viewKey: string): string {
  if (viewKey.trim() === '') throw new Error('A view key is required.');
  return `.studio/views/${encodeURIComponent(viewKey)}.json`;
}

function parseOrder(text: string): string[] {
  try {
    const value: unknown = JSON.parse(text);
    if (
      typeof value === 'object' && value !== null &&
      (value as Partial<StoredViewOrder>).version === 1 &&
      Array.isArray((value as Partial<StoredViewOrder>).noteIds) &&
      (value as Partial<StoredViewOrder>).noteIds?.every((id) => typeof id === 'string')
    ) {
      return [...new Set((value as StoredViewOrder).noteIds)];
    }
  } catch {
    // Invalid view state is disposable and falls back to deterministic projection order.
  }
  return [];
}

export function createViewStateRepository(vault: VaultPort): ViewStateRepository {
  return {
    async load(viewKey) {
      try {
        return parseOrder((await vault.readText(viewPath(viewKey))).text);
      } catch (error) {
        if (error instanceof VaultUnavailableError) return [];
        throw error;
      }
    },

    async save(viewKey, noteIds) {
      const path = viewPath(viewKey);
      const text = `${JSON.stringify({ version: 1, noteIds: [...new Set(noteIds)] }, null, 2)}\n`;
      try {
        const current = await vault.readText(path);
        await vault.writeTextAtomic(path, text, { expectedHash: current.hash });
      } catch (error) {
        if (!(error instanceof VaultUnavailableError)) throw error;
        await vault.writeTextAtomic(path, text, { expectedMissing: true });
      }
    },
  };
}
