import { createBrowserVault } from '@studio/storage/browser';
import type { VaultChange, VaultPort } from '@studio/storage';

const vaults = new Map<string, VaultPort>();
const events = new Map<string, VaultChange[]>();

function vault(id: string): VaultPort {
  const selected = vaults.get(id);
  if (selected === undefined) throw new Error(`Unknown vault handle: ${id}`);
  return selected;
}

const harness = {
  create(name: string, storage: 'auto' | 'opfs' | 'indexeddb' = 'auto'): string {
    const id = crypto.randomUUID();
    vaults.set(id, createBrowserVault(name, { storage }));
    events.set(id, []);
    return id;
  },
  async write(id: string, path: string, text: string, expectedHash?: string) {
    return vault(id).writeTextAtomic(
      path,
      text,
      expectedHash === undefined ? undefined : { expectedHash },
    );
  },
  async read(id: string, path: string) {
    return vault(id).readText(path);
  },
  async move(id: string, from: string, to: string) {
    await vault(id).move(from, to);
  },
  async remove(id: string, path: string) {
    await vault(id).remove(path);
  },
  async exists(id: string, path: string) {
    return vault(id).exists(path);
  },
  async watch(id: string) {
    await vault(id).watch((event) => events.get(id)?.push(event));
  },
  events(id: string) {
    return events.get(id) ?? [];
  },
};

declare global {
  interface Window {
    studioVaultTest: typeof harness;
  }
}

window.studioVaultTest = harness;
