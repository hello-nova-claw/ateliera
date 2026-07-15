import { describe, expect, it } from 'vitest';
import {
  activateBrowserStudio,
  createBrowserStudioRecord,
  readActiveBrowserStudio,
  readBrowserStudios,
  registerBrowserStudio,
} from './browser-studios';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('browser Studio registry', () => {
  it('creates a stable vault identifier from a human-readable name', () => {
    expect(createBrowserStudioRecord('  Anna’s Studio  ')).toMatchObject({
      name: 'Anna’s Studio',
      vaultId: 'studio:anna%E2%80%99s%20studio',
    });
  });

  it('treats missing or malformed registry data as empty', () => {
    expect(readBrowserStudios(memoryStorage())).toEqual([]);
    expect(
      readBrowserStudios(
        memoryStorage({ 'studio:browser-studios': '{not valid json' }),
      ),
    ).toEqual([]);
  });

  it('registers and activates a named local Studio', () => {
    const storage = memoryStorage();
    const record = createBrowserStudioRecord('Ateliera');

    registerBrowserStudio(storage, record);
    activateBrowserStudio(storage, record.vaultId);

    expect(readBrowserStudios(storage)).toEqual([record]);
    expect(readActiveBrowserStudio(storage)).toEqual(record);
  });

  it('rejects duplicate names without replacing existing data', () => {
    const storage = memoryStorage();
    const record = createBrowserStudioRecord('Ateliera');
    registerBrowserStudio(storage, record);

    expect(() =>
      registerBrowserStudio(storage, createBrowserStudioRecord('ateliera')),
    ).toThrow('A local Studio named “ateliera” already exists.');
    expect(readBrowserStudios(storage)).toEqual([record]);
  });
});
