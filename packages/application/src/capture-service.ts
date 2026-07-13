import { createNoteId, parseNote, serializeNote, suggestFilename } from '@studio/content';
import type { StudioNote } from '@studio/domain';
import { createBrowserVault } from '@studio/storage/browser';
import type { VaultPort } from '@studio/storage/portable';

/** @deprecated Use StudioService.capture after the application shell is migrated in Task 9. */
export interface CaptureEntry {
  id: string;
  text: string;
}

/** @deprecated Use StudioService after the application shell is migrated in Task 9. */
export interface CaptureService {
  capture(text: string): Promise<CaptureEntry>;
  list(): Promise<CaptureEntry[]>;
}

/** @deprecated Compatibility bridge for the Task 1 shell. */
export function createCaptureService(vault: VaultPort): CaptureService {
  return {
    async capture(text) {
      const remembered = text.trim();
      if (remembered === '') throw new Error('Write something to remember first.');
      const now = new Date().toISOString();
      const note: StudioNote = {
        schemaVersion: 1,
        id: createNoteId(),
        title: remembered.slice(0, 80),
        body: remembered,
        cardType: 'capture',
        semanticType: 'reflection',
        status: 'active',
        rooms: ['reflection-garden'],
        lifeAreas: [],
        seasons: [],
        tags: [],
        created: now,
        updated: now,
        attachments: [],
        display: { featured: false },
        privacy: { sensitivity: 'private', aiAccess: 'ask' },
        extraFrontmatter: {},
        lineEnding: '\n',
      };
      await vault.writeTextAtomic(`Inbox/${suggestFilename(note)}`, serializeNote(note));
      return { id: note.id, text: remembered };
    },
    async list() {
      const entries = await vault.list('Inbox');
      const captures: CaptureEntry[] = [];
      for (const entry of entries) {
        if (entry.kind !== 'file' || !entry.path.endsWith('.md')) continue;
        const parsed = parseNote((await vault.readText(entry.path)).text);
        if (parsed.ok && parsed.note.cardType === 'capture') {
          captures.push({ id: parsed.note.id, text: parsed.note.body });
        }
      }
      return captures;
    },
  };
}

/** @deprecated Compatibility bridge for the Task 1 shell. */
export function createBrowserCaptureService(vaultName = 'the-studio'): CaptureService {
  return createCaptureService(createBrowserVault(vaultName));
}
