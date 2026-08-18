import type { StudioNote } from '@studio/domain';
import { stringify } from 'yaml';

export function serializeNote(note: StudioNote): string {
  const frontmatter: Record<string, unknown> = {
    ...note.extraFrontmatter,
    schema_version: note.schemaVersion,
    id: note.id,
    ...(note.title === undefined ? {} : { title: note.title }),
    card_type: note.cardType,
    semantic_type: note.semanticType,
    status: note.status,
    rooms: note.rooms,
    life_areas: note.lifeAreas,
    ...(note.landscapeAnchor === undefined
      ? {}
      : { landscape_anchor: note.landscapeAnchor }),
    seasons: note.seasons,
    tags: note.tags,
    created: note.created,
    updated: note.updated,
    ...(note.source === undefined ? {} : { source: note.source }),
    ...(note.sourceNoteIds === undefined
      ? {}
      : { source_notes: note.sourceNoteIds }),
    ...(note.resurfaceKind === undefined
      ? {}
      : { resurface_kind: note.resurfaceKind }),
    ...(note.resurfaceDue === undefined
      ? {}
      : { resurface_due: note.resurfaceDue }),
    ...(note.resurfaceIntervalDays === undefined
      ? {}
      : { resurface_interval_days: note.resurfaceIntervalDays }),
    attachments: note.attachments,
    display: note.display,
    privacy: {
      sensitivity: note.privacy.sensitivity,
      ai_access: note.privacy.aiAccess,
    },
  };
  const eol = note.lineEnding ?? '\n';
  const yaml = stringify(frontmatter, { lineWidth: 0 })
    .trimEnd()
    .replaceAll('\n', eol);
  return `---${eol}${yaml}${eol}---${eol}${note.body}`;
}
