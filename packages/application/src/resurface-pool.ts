import type { IndexedNoteRecord, IndexPort } from '@studio/index';
import type { ResurfaceCard } from '@studio/rhythm';

// The only rooms that hold resurfacing candidates: Reflection Garden cards
// (evidence/reframe) and Uncharted cards (wish/dream).
const RESURFACE_ROOMS = ['reflection-garden', 'uncharted'];

function toResurfaceCard(record: IndexedNoteRecord): ResurfaceCard | undefined {
  const { note, path } = record;
  if (
    note.resurfaceKind === undefined ||
    note.resurfaceDue === undefined ||
    note.resurfaceIntervalDays === undefined
  ) {
    return undefined;
  }
  return {
    sourcePath: path,
    kind: note.resurfaceKind,
    dueDate: note.resurfaceDue,
    intervalDays: note.resurfaceIntervalDays,
  };
}

/**
 * Build the pool of resurfacing candidates from the index: every Reflection
 * Garden or Uncharted note that carries a resurface_kind (and its paired
 * resurface_due / resurface_interval_days), mapped to a rhythm ResurfaceCard.
 * Notes missing any of those three fields are excluded.
 */
export async function buildResurfacePool(index: IndexPort): Promise<ResurfaceCard[]> {
  const hits = await index.search('', { rooms: RESURFACE_ROOMS });
  const records = await index.getManyById(hits.map((hit) => hit.id));
  const pool: ResurfaceCard[] = [];
  for (const record of records) {
    const card = toResurfaceCard(record);
    if (card !== undefined) pool.push(card);
  }
  return pool;
}
