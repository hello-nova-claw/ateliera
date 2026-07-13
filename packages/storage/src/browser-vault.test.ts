import { vaultContract } from './__contract__/vault-contract';
import {
  createBrowserVault,
  type BrowserVaultStore,
  type StoredBrowserFile,
} from './browser-vault';

function createTestStore(): BrowserVaultStore {
  const files = new Map<string, StoredBrowserFile>();

  return {
    async entries() {
      return [...files.entries()].map(([path, file]) => [
        path,
        { ...file, bytes: file.bytes.slice() },
      ] as const);
    },
    async read(path) {
      const file = files.get(path);
      return file === undefined
        ? undefined
        : { ...file, bytes: file.bytes.slice() };
    },
    async write(path, file) {
      files.set(path, { ...file, bytes: file.bytes.slice() });
    },
    async remove(path) {
      files.delete(path);
    },
  };
}

vaultContract('browser vault', async () =>
  createBrowserVault(`contract-${crypto.randomUUID()}`, {
    store: createTestStore(),
  }),
);
