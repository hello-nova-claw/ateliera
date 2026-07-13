import {
  createDraftRecoveryStore,
  type DraftRecoveryStorage,
  type DraftRecoveryStore,
} from '@studio/application';

export type BrowserDraftRecovery = DraftRecoveryStore & { available: boolean };

const memory = new Map<string, string>();
const memoryStorage: DraftRecoveryStorage = {
  getItem: (key) => memory.get(key) ?? null,
  removeItem: (key) => {
    memory.delete(key);
  },
  setItem: (key, value) => {
    memory.set(key, value);
  },
};

export function browserDraftRecovery(): BrowserDraftRecovery {
  try {
    const storage = window.sessionStorage;
    return Object.assign(createDraftRecoveryStore(storage), { available: true });
  } catch {
    return Object.assign(createDraftRecoveryStore(memoryStorage), { available: false });
  }
}
