import {
  createNoteId,
  parseNote,
  serializeNote,
  suggestFilename,
} from '@studio/content';
import type { StudioNote } from '@studio/domain';
import { VaultConflictError, VaultUnavailableError } from '@studio/storage/portable';
import type { VaultPort } from '@studio/storage/portable';

export interface CaptureEntry {
  id: string;
  text: string;
}

export interface CaptureService {
  capture(text: string): Promise<CaptureEntry>;
  list(): Promise<CaptureEntry[]>;
}

/** CAS-protected transitional adapter retained until the Task 9 shell uses StudioService. */
export function createCaptureService(vault: VaultPort): CaptureService {
  return {
    async capture(text) {
      const body = text.trim();
      if (body === '') throw new Error('Write something to remember first.');
      const created = new Date().toISOString();
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const note: StudioNote = {
          schemaVersion: 1,
          id: createNoteId(),
          body,
          cardType: 'capture',
          semanticType: 'reflection',
          status: 'draft',
          rooms: ['inbox'],
          lifeAreas: [],
          seasons: [],
          tags: [],
          created,
          updated: created,
          attachments: [],
          display: { featured: false },
          privacy: { sensitivity: 'private', aiAccess: 'ask' },
          extraFrontmatter: {},
          lineEnding: '\n',
        };
        try {
          await vault.writeTextAtomic(
            `Inbox/${suggestFilename(note)}`,
            serializeNote(note),
            { expectedMissing: true },
          );
          return { id: note.id, text: body };
        } catch (error) {
          if (!(error instanceof VaultConflictError)) throw error;
        }
      }
      throw new Error('A unique capture path could not be reserved. Please try again.');
    },

    async list() {
      const entries = await vault.list('Inbox');
      const captures: CaptureEntry[] = [];
      for (const entry of entries) {
        if (entry.kind !== 'file' || !entry.path.toLocaleLowerCase('en').endsWith('.md')) continue;
        try {
          const parsed = parseNote((await vault.readText(entry.path)).text);
          if (parsed.ok && parsed.note.cardType === 'capture') {
            captures.push({ id: parsed.note.id, text: parsed.note.body });
          }
        } catch (error) {
          if (error instanceof VaultUnavailableError) {
            let stillExists: boolean;
            try {
              stillExists = await vault.exists(entry.path);
            } catch {
              throw error;
            }
            if (!stillExists) continue;
          }
          throw error;
        }
      }
      return captures;
    },
  };
}
