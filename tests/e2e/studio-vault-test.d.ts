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
}

interface Window {
  studioVaultTest: StudioVaultTestHarness;
}
