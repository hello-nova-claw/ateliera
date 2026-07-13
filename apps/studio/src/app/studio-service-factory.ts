import { createStudioService, type StudioService } from '@studio/application';
import type { StudioNote } from '@studio/domain';
import type {
  IndexEntry,
  IndexedContent,
  IndexedLink,
  IndexPort,
  SearchHit,
} from '@studio/index';
import type { VaultPort } from '@studio/storage/portable';

class SessionIndex implements IndexPort {
  readonly entries = new Map<string, IndexEntry>();

  async upsert(
    note: StudioNote,
    path: string,
    hash: string,
    content: IndexedContent,
  ): Promise<void> {
    this.entries.set(note.id, { note, path, hash, content });
  }

  async remove(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async getById(id: string): Promise<IndexEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async search(): Promise<SearchHit[]> {
    return [];
  }

  async backlinks(): Promise<string[]> {
    return [];
  }

  async forwardLinks(): Promise<IndexedLink[]> {
    return [];
  }

  async rebuild(entries: IndexEntry[]): Promise<void> {
    this.entries.clear();
    for (const entry of entries) this.entries.set(entry.note.id, entry);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

/** Temporary UI-safe index until the browser worker lands in the Search slice. */
export function createAppStudioService(vault: VaultPort): StudioService {
  return createStudioService({ vault, index: new SessionIndex() });
}
