import {
  createBrowserVault,
  type BrowserVaultStore,
  type StoredBrowserFile,
} from '@studio/storage/browser';
import {
  selectTauriVault,
  type TauriVaultBridge,
} from '@studio/storage/tauri';
import { describe, expect, it, vi } from 'vitest';

import {
  LIFE_AREA_CONFIG_PATH,
  createLifeAreaRepository,
} from './life-area-repository';
import { createStudioService } from './studio-service';
import { RecordingIndex } from './test-helpers';

function recordingBrowserStore(paths: string[]): BrowserVaultStore {
  const files = new Map<string, StoredBrowserFile>();
  return {
    async entries() {
      return [...files.entries()];
    },
    async read(path) {
      paths.push(path);
      return files.get(path);
    },
    async write(path, file) {
      paths.push(path);
      files.set(path, {
        ...file,
        bytes: file.bytes.slice(),
      });
    },
    async remove(path) {
      paths.push(path);
      files.delete(path);
    },
  };
}

function lifeAreaTauriBridge(paths: string[]): TauriVaultBridge {
  let stored: { text: string; hash: string } | undefined;
  let revision = 0;
  return {
    invoke: vi.fn(async (command, args) => {
      if (command === 'vault_select') {
        return {
          vaultToken: '0123456789abcdef0123456789abcdef',
          recoveryIdentity: 'fedcba9876544abc8edcba9876543210',
        };
      }
      const path = args.path;
      if (typeof path === 'string') {
        paths.push(path);
        if (path !== LIFE_AREA_CONFIG_PATH) throw new Error('path_escape');
      }
      if (command === 'vault_read_text') {
        if (stored === undefined) throw new Error('unavailable');
        return stored;
      }
      if (command === 'vault_exists') return stored !== undefined;
      if (command === 'vault_write_text_atomic') {
        if (args.expectedMissing === true && stored !== undefined) {
          throw new Error('conflict');
        }
        if (
          typeof args.expectedHash === 'string' &&
          args.expectedHash !== stored?.hash
        ) {
          throw new Error('conflict');
        }
        revision += 1;
        stored = { text: String(args.text), hash: `native-${revision}` };
        return { hash: stored.hash };
      }
      throw new Error(`Unexpected command: ${command}`);
    }),
    listen: async () => () => undefined,
  };
}

describe('life area production adapter boundary', () => {
  it('round trips through the browser adapter from the real StudioService factory', async () => {
    const paths: string[] = [];
    const vault = createBrowserVault('life-area-browser-proof', {
      store: recordingBrowserStore(paths),
    });
    const service = createStudioService({ vault, index: new RecordingIndex() });
    const initial = await service.lifeAreas.load();
    const renamed = initial.areas.map((area) =>
      area.id === 'family' ? { ...area, title: 'Family & Belonging' } : area,
    );

    await service.lifeAreas.save(renamed, initial.revision);

    const reopened = createStudioService({ vault, index: new RecordingIndex() });
    expect((await reopened.lifeAreas.load()).areas[0]?.title).toBe(
      'Family & Belonging',
    );
    expect(new Set(paths)).toEqual(new Set([LIFE_AREA_CONFIG_PATH]));
  });

  it('round trips through the mocked Tauri runtime without a caller-selected config path', async () => {
    const paths: string[] = [];
    const vault = await selectTauriVault(lifeAreaTauriBridge(paths));
    expect(vault).not.toBeNull();
    const service = createStudioService({
      vault: vault!,
      index: new RecordingIndex(),
    });
    const initial = await service.lifeAreas.load();
    const reordered = initial.areas.map((area) => ({
      ...area,
      order: initial.areas.length - 1 - area.order,
    }));

    await service.lifeAreas.save(reordered, initial.revision);

    expect((await service.lifeAreas.load()).areas[0]?.id).toBe('learning');
    expect(new Set(paths)).toEqual(new Set([LIFE_AREA_CONFIG_PATH]));
    expect(Object.keys(createLifeAreaRepository(vault!)).sort()).toEqual([
      'load',
      'save',
    ]);
  });
});
