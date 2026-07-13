interface StudioVaultTestHarness {
  create(name: string, storage?: 'auto' | 'opfs' | 'indexeddb'): string;
  write(
    id: string,
    path: string,
    text: string,
    expectedHash?: string,
  ): Promise<{ hash: string }>;
  read(id: string, path: string): Promise<{ text: string; hash: string }>;
  move(id: string, from: string, to: string): Promise<void>;
  remove(id: string, path: string): Promise<void>;
  exists(id: string, path: string): Promise<boolean>;
  watch(id: string): Promise<void>;
  events(id: string): Array<{
    kind: string;
    path: string;
    hash?: string;
    previousPath?: string;
  }>;
  seedLifecycleNote(id: string, noteId: string, path: string, attachments: string[]): Promise<void>;
  archive(id: string, noteId: string): Promise<{ status: string }>;
  unarchive(id: string, noteId: string): Promise<{ status: string }>;
  trash(id: string, noteId: string): Promise<{
    trashPath: string;
    attachments: Array<{
      path: string;
      availability: 'available' | 'missing' | 'unknown';
    }>;
  }>;
  restore(id: string, noteId: string): Promise<{
    path: string;
    relocated: boolean;
    missingAttachments: string[];
    unknownAttachments: string[];
  }>;
  reconcileTrash(id: string): Promise<string[]>;
}

interface Window {
  studioVaultTest: StudioVaultTestHarness;
}
