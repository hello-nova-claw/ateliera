import { describe } from 'vitest';

import { vaultContract } from './__contract__/vault-contract';
import { createInMemoryVault } from './in-memory-vault';
import { createTauriVault, type TauriVaultBridge } from './tauri-vault';

describe('Tauri vault IPC adapter', () => {
  vaultContract('Tauri vault contract', async () => {
    const memory = createInMemoryVault();
    const listeners = new Set<(event: unknown) => void>();
    await memory.watch((event) => listeners.forEach((listener) => listener(event)));
    const bridge: TauriVaultBridge = {
      invoke: async (command, args) => {
        const path = String(args.path ?? '');
        switch (command) {
          case 'vault_list': return memory.list(args.prefix as string | undefined);
          case 'vault_read_text': return memory.readText(path);
          case 'vault_write_text_atomic': return memory.writeTextAtomic(path, String(args.text), args.expectedHash === undefined ? undefined : { expectedHash: String(args.expectedHash) });
          case 'vault_read_binary': return [...await memory.readBinary(path)];
          case 'vault_write_binary_atomic': return memory.writeBinaryAtomic(path, new Uint8Array(args.bytes as number[]));
          case 'vault_move': return memory.move(String(args.from), String(args.to));
          case 'vault_remove': return memory.remove(path);
          case 'vault_exists': return memory.exists(path);
          case 'vault_watch': return { id: 'watch-id', event: 'vault-event' };
          case 'vault_unwatch': return undefined;
          default: throw new Error(`Unknown command: ${command}`);
        }
      },
      listen: async (_event, listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    return createTauriVault('/selected-vault', bridge);
  });
});
