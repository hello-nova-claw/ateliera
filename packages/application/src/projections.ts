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

export interface ActiveSeasonProjection {
  current: StudioCardProjection | null;
  conflicts: StudioCardProjection[];
  repair?: {
    code: 'multiple-active-seasons';
    noteIds: string[];
  };
}

export interface LandscapeProjectionQuery {
  lifeArea: string;
  anchor?: LandscapeAnchor;
}

function visible(item: LoadedNote, viewKey: string): boolean {
  return item.note.status !== 'archived' &&
    item.note.status !== 'trashed' &&
    item.note.extraFrontmatter.excluded_from_views !== true &&
    item.note.extraFrontmatter.excluded !== true &&
    !(
      item.note.status === 'draft' &&
      item.note.rooms.includes('inbox') &&
      viewKey !== 'room:inbox'
    );
}

function fallbackCompare(left: LoadedNote, right: LoadedNote): number {
  return Date.parse(right.note.updated) - Date.parse(left.note.updated) ||
    Date.parse(right.note.created) - Date.parse(left.note.created) ||
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
  views?: ViewStateRepository,
): Promise<StudioCardProjection[]> {
  const sorted = dedupe(items.filter((item) => visible(item, viewKey)).sort(fallbackCompare));
  const manual = views === undefined ? [] : await views.load(viewKey);
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
): Promise<ActiveSeasonProjection> {
  const candidates = await orderedProjection(
    notes.filter((item) =>
      item.note.cardType === 'season' &&
      item.note.status === 'active' &&
      item.note.rooms.includes('current-season')),
    'current-season:active',
  );
  const current = candidates[0] ?? null;
  const conflicts = candidates.slice(1);
  return {
    current,
    conflicts,
    ...(conflicts.length === 0
      ? {}
      : {
          repair: {
            code: 'multiple-active-seasons' as const,
            noteIds: candidates.map((candidate) => candidate.noteId),
          },
        }),
  };
}

export async function projectFoyer(
  notes: LoadedNote[],
  views: ViewStateRepository,
): Promise<FoyerProjection> {
  const [activeSeason, featuredCandidates] = await Promise.all([
    projectCurrentSeason(notes),
    orderedProjection(
      notes.filter((item) => item.note.display.featured || item.note.rooms.includes('foyer')),
      'foyer:featured',
      views,
    ),
  ]);
  return {
    currentSeason: activeSeason.current,
    featured: featuredCandidates.filter(
      (item) => item.noteId !== activeSeason.current?.noteId,
    ),
  };
}
