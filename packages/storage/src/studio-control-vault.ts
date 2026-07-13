import { PathEscapeError } from './conflict';
import type { MoveCondition, VaultEntry, VaultPort, WriteCondition } from './vault-port';

export interface StudioControlVault {
  list(prefix: string): Promise<VaultEntry[]>;
  readText(path: string): ReturnType<VaultPort['readText']>;
  writeTextAtomic(path: string, text: string, condition?: WriteCondition): ReturnType<VaultPort['writeTextAtomic']>;
  readBinary(path: string): ReturnType<VaultPort['readBinary']>;
  writeBinaryAtomic(path: string, bytes: Uint8Array, condition?: WriteCondition): ReturnType<VaultPort['writeBinaryAtomic']>;
  remove(path: string, condition?: WriteCondition): ReturnType<VaultPort['remove']>;
  exists(path: string): ReturnType<VaultPort['exists']>;
  moveInto(userPath: string, controlPath: string, condition?: MoveCondition): ReturnType<VaultPort['move']>;
  moveOut(controlPath: string, userPath: string, condition?: MoveCondition): ReturnType<VaultPort['move']>;
}

function isAllowedControlPath(path: string): boolean {
  const folded = path.toLocaleLowerCase('en');
  return folded === '.studio/trash' || folded.startsWith('.studio/trash/') ||
    folded === '.studio/backups' || folded.startsWith('.studio/backups/');
}

function controlPath(path: string): string {
  if (!isAllowedControlPath(path)) throw new PathEscapeError();
  return path;
}

function userPath(path: string): string {
  const segments = path.split('/');
  if (segments.some((segment) => {
    const folded = segment.toLocaleLowerCase('en');
    return folded === '.studio' || folded.startsWith('.studio-');
  })) throw new PathEscapeError();
  return path;
}

export function createStudioControlVault(vault: VaultPort): StudioControlVault {
  return {
    list: async (prefix) => vault.list(controlPath(prefix)),
    readText: async (path) => vault.readText(controlPath(path)),
    writeTextAtomic: async (path, text, condition) =>
      vault.writeTextAtomic(controlPath(path), text, condition),
    readBinary: async (path) => vault.readBinary(controlPath(path)),
    writeBinaryAtomic: async (path, bytes, condition) =>
      vault.writeBinaryAtomic(controlPath(path), bytes, condition),
    remove: async (path, condition) => vault.remove(controlPath(path), condition),
    exists: async (path) => vault.exists(controlPath(path)),
    moveInto: async (from, to, condition) => vault.move(userPath(from), controlPath(to), condition),
    moveOut: async (from, to, condition) => vault.move(controlPath(from), userPath(to), condition),
  };
}
