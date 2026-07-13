import { markdownToPlainText } from '@studio/content';
import type { LandscapeAnchor, SemanticType, StudioNote } from '@studio/domain';

import type { ViewStateRepository } from './view-state';

export interface LoadedNote {
  note: StudioNote;
  path: string;
  hash: string;
}

export interface StudioCardProjection {
  noteId: string;
  path: string;
  title: string;
  excerpt: string;
  semanticType: SemanticType;
  status: StudioNote['status'];
  updated: string;
}

export interface FoyerProjection {
  currentSeason: StudioCardProjection | null;
  featured: StudioCardProjection[];
}

export interface LandscapeProjectionQuery {
  lifeArea: string;
  anchor?: LandscapeAnchor;
}

function visible(item: LoadedNote): boolean {
  return item.note.status !== 'archived' &&
    item.note.status !== 'trashed' &&
    item.note.extraFrontmatter.excluded_from_views !== true &&
    item.note.extraFrontmatter.excluded !== true;
}

function fallbackCompare(left: LoadedNote, right: LoadedNote): number {
  return right.note.updated.localeCompare(left.note.updated, 'en') ||
    right.note.created.localeCompare(left.note.created, 'en') ||
    (left.note.title ?? '').localeCompare(right.note.title ?? '', 'en') ||
    left.note.id.localeCompare(right.note.id, 'en');
}

function toCard(item: LoadedNote): StudioCardProjection {
  const plain = markdownToPlainText(item.note.body);
  return {
    noteId: item.note.id,
    path: item.path,
    title: item.note.title?.trim() || plain.slice(0, 80) || 'Untitled',
    excerpt: plain.slice(0, 240),
    semanticType: item.note.semanticType,
    status: item.note.status,
    updated: item.note.updated,
  };
}

function dedupe(items: LoadedNote[]): LoadedNote[] {
  const seen = new Set<string>();
  return items.flatMap((item) => {
    if (seen.has(item.note.id)) return [];
    seen.add(item.note.id);
    return [item];
  });
}

export async function orderedProjection(
  items: LoadedNote[],
  viewKey: string,
  views: ViewStateRepository,
): Promise<StudioCardProjection[]> {
  const sorted = dedupe(items.filter(visible).sort(fallbackCompare));
  const manual = await views.load(viewKey);
  const byId = new Map(sorted.map((item) => [item.note.id, item]));
  const manualItems = manual.flatMap((id) => {
    const item = byId.get(id);
    return item === undefined ? [] : [item];
  });
  const manuallyPlaced = new Set(manualItems.map((item) => item.note.id));
  return [...manualItems, ...sorted.filter((item) => !manuallyPlaced.has(item.note.id))].map(toCard);
}

function belongsToRoom(note: StudioNote, room: string): boolean {
  if (note.rooms.includes(room)) return true;
  if (room === 'uncharted') return note.semanticType === 'uncharted';
  if (room === 'reflection-garden') {
    return note.semanticType === 'reflection' || note.semanticType === 'celebration';
  }
  return false;
}

export async function projectRoom(
  notes: LoadedNote[],
  room: string,
  views: ViewStateRepository,
): Promise<StudioCardProjection[]> {
  return orderedProjection(
    notes.filter((item) => belongsToRoom(item.note, room)),
    `room:${room}`,
    views,
  );
}

export async function projectLandscape(
  notes: LoadedNote[],
  query: LandscapeProjectionQuery,
  views: ViewStateRepository,
): Promise<StudioCardProjection[]> {
  const suffix = query.anchor === undefined ? '' : `:${query.anchor}`;
  return orderedProjection(
    notes.filter((item) =>
      item.note.lifeAreas.includes(query.lifeArea) &&
      (query.anchor === undefined || item.note.landscapeAnchor === query.anchor)),
    `landscape:${query.lifeArea}${suffix}`,
    views,
  );
}

export async function projectStream(
  notes: LoadedNote[],
  semanticType: 'reflection' | 'celebration',
  views: ViewStateRepository,
): Promise<StudioCardProjection[]> {
  return orderedProjection(
    notes.filter((item) => item.note.semanticType === semanticType),
    `stream:${semanticType}`,
    views,
  );
}

export async function projectCurrentSeason(
  notes: LoadedNote[],
  views: ViewStateRepository,
): Promise<StudioCardProjection | null> {
  const candidates = await orderedProjection(
    notes.filter((item) =>
      item.note.cardType === 'season' &&
      item.note.status === 'active' &&
      item.note.rooms.includes('current-season')),
    'current-season:active',
    views,
  );
  return candidates[0] ?? null;
}

export async function projectFoyer(
  notes: LoadedNote[],
  views: ViewStateRepository,
): Promise<FoyerProjection> {
  const [currentSeason, featured] = await Promise.all([
    projectCurrentSeason(notes, views),
    orderedProjection(
      notes.filter((item) => item.note.display.featured || item.note.rooms.includes('foyer')),
      'foyer:featured',
      views,
    ),
  ]);
  return { currentSeason, featured };
}
