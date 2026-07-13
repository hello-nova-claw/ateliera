import { createBrowserVault } from '@studio/storage/browser';
import type { VaultChange, VaultPort } from '@studio/storage';
import type { StudioService } from '@studio/application';
import type { StudioNote } from '@studio/domain';
import { createAppStudioService } from './app/studio-service-factory';

const vaults = new Map<string, VaultPort>();
const services = new Map<string, StudioService>();
const events = new Map<string, VaultChange[]>();

function vault(id: string): VaultPort {
  const selected = vaults.get(id);
  if (selected === undefined) throw new Error(`Unknown vault handle: ${id}`);
  return selected;
}

function service(id: string): StudioService {
  const selected = services.get(id);
  if (selected === undefined) throw new Error(`Unknown Studio service: ${id}`);
  return selected;
}

const harness = {
  create(name: string, storage: 'auto' | 'opfs' | 'indexeddb' = 'auto'): string {
    const id = crypto.randomUUID();
    const selected = createBrowserVault(name, { storage });
    vaults.set(id, selected);
    services.set(id, createAppStudioService(selected));
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
  async seedLifecycleNote(
    id: string,
    noteId: string,
    path: string,
    attachments: string[],
  ): Promise<void> {
    const now = new Date().toISOString();
    const value: StudioNote = {
      schemaVersion: 1,
      id: noteId,
      title: 'Lifecycle note',
      body: 'A note whose lifecycle stays recoverable.',
      cardType: 'note',
      semanticType: 'reflection',
      status: 'active',
      rooms: ['reflection-garden'],
      lifeAreas: [],
      seasons: [],
      tags: [],
      created: now,
      updated: now,
      attachments,
      display: { featured: false },
      privacy: { sensitivity: 'private', aiAccess: 'ask' },
      extraFrontmatter: { harness_unknown: 'preserved' },
      lineEnding: '\n',
    };
    await service(id).save({ note: value, path, expectedMissing: true });
  },
  async archive(id: string, noteId: string) {
    const result = await service(id).archive(noteId);
    return { status: result.note.status };
  },
  async unarchive(id: string, noteId: string) {
    const result = await service(id).unarchive(noteId);
    return { status: result.note.status };
  },
  trash: (id: string, noteId: string) => service(id).trash(noteId),
  restore: (id: string, noteId: string) => service(id).restore(noteId),
  reconcileTrash: (id: string) => service(id).reconcileTrash(),
};

declare global {
  interface Window {
    studioVaultTest: typeof harness;
  }
}

window.studioVaultTest = harness;
