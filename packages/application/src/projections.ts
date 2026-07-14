import { markdownToPlainText } from '@studio/content';
import {
  isDecisionHorizon,
  landscapeAnchors,
  type DecisionHorizon,
  type LandscapeAnchor,
  type SemanticType,
  type StudioNote,
} from '@studio/domain';

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
  cardType: string;
  status: StudioNote['status'];
  updated: string;
}

export interface UnchartedCardProjection extends StudioCardProjection {
  hash: string;
  horizon: 'near' | 'beyond';
  seasons: string[];
}

export interface UnchartedProjection {
  cards: UnchartedCardProjection[];
}

export type ReflectionEvidenceConnection =
  | {
      kind: 'note';
      id: string;
      targetState: 'available' | 'archived' | 'missing';
    }
  | {
      kind: 'life-area' | 'season';
      id: string;
      label: string;
      targetState: 'available' | 'archived';
    }
  | {
      kind: 'life-area' | 'season';
      id: string;
      targetState: 'missing';
    };

export interface ReflectionLifeAreaTarget {
  id: string;
  title: string;
  hidden: boolean;
}

export interface ReflectionCardProjection extends StudioCardProjection {
  hash: string;
  created: string;
  lifeAreas: string[];
  seasons: string[];
  tags: string[];
  linkedNoteIds: string[];
  evidenceConnections: ReflectionEvidenceConnection[];
  thenNoteId?: string;
  coverReference?: string;
}

export interface ReflectionThemeProjection {
  name: string;
  count: number;
}

export interface ReflectionGardenProjection {
  cards: ReflectionCardProjection[];
  themes: ReflectionThemeProjection[];
}

export interface FoyerImageProjection {
  noteId: string;
  path: string;
  hash: string;
  source: string;
  alt: string;
  caption?: string;
}

export interface FoyerProjection {
  currentSeason: StudioCardProjection | null;
  featured: StudioCardProjection[];
  becoming: StudioCardProjection | null;
  feelings: StudioCardProjection[];
  principles: StudioCardProjection[];
  priorities: StudioCardProjection[];
  returning: StudioCardProjection | null;
  image: FoyerImageProjection | null;
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

export interface LandscapeCardProjection extends StudioCardProjection {
  hash: string;
  lifeAreas: string[];
  anchor: LandscapeAnchor;
  decisionHorizon?: DecisionHorizon;
}

export interface LandscapeCellProjection {
  lifeArea: string;
  anchor: LandscapeAnchor;
  featured: LandscapeCardProjection | null;
  additionalCount: number;
  noteIds: string[];
  cards: LandscapeCardProjection[];
}

export interface LandscapeBoardProjection {
  cells: LandscapeCellProjection[];
}

function visible(item: LoadedNote, viewKey: string): boolean {
  return (
    item.note.status !== 'archived' &&
    item.note.status !== 'trashed' &&
    item.note.extraFrontmatter.excluded_from_views !== true &&
    item.note.extraFrontmatter.excluded !== true &&
    !(
      item.note.status === 'draft' &&
      item.note.rooms.includes('inbox') &&
      viewKey !== 'room:inbox'
    )
  );
}

function fallbackCompare(left: LoadedNote, right: LoadedNote): number {
  return (
    Date.parse(right.note.updated) - Date.parse(left.note.updated) ||
    Date.parse(right.note.created) - Date.parse(left.note.created) ||
    (left.note.title ?? '').localeCompare(right.note.title ?? '', 'en') ||
    left.note.id.localeCompare(right.note.id, 'en')
  );
}

function toCard(item: LoadedNote): StudioCardProjection {
  const plain = markdownToPlainText(item.note.body);
  return {
    noteId: item.note.id,
    path: item.path,
    title: item.note.title?.trim() || plain.slice(0, 80) || 'Untitled',
    excerpt: plain.slice(0, 240),
    semanticType: item.note.semanticType,
    cardType: item.note.cardType,
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
  const sorted = dedupe(
    items.filter((item) => visible(item, viewKey)).sort(fallbackCompare),
  );
  const manual = views === undefined ? [] : await views.load(viewKey);
  const byId = new Map(sorted.map((item) => [item.note.id, item]));
  const manualItems = manual.flatMap((id) => {
    const item = byId.get(id);
    return item === undefined ? [] : [item];
  });
  const manuallyPlaced = new Set(manualItems.map((item) => item.note.id));
  return [
    ...manualItems,
    ...sorted.filter((item) => !manuallyPlaced.has(item.note.id)),
  ].map(toCard);
}

function belongsToRoom(note: StudioNote, room: string): boolean {
  if (note.rooms.includes(room)) return true;
  if (room === 'uncharted') return note.semanticType === 'uncharted';
  if (room === 'reflection-garden') {
    return (
      note.semanticType === 'reflection' || note.semanticType === 'celebration'
    );
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
    notes.filter(
      (item) =>
        item.note.lifeAreas.includes(query.lifeArea) &&
        (query.anchor === undefined ||
          item.note.landscapeAnchor === query.anchor),
    ),
    `landscape:${query.lifeArea}${suffix}`,
    views,
  );
}

export async function projectLandscapeBoard(
  notes: LoadedNote[],
  lifeAreas: readonly string[],
  views: ViewStateRepository,
): Promise<LandscapeBoardProjection> {
  const uniqueAreas = [...new Set(lifeAreas)];
  const cells = await Promise.all(
    uniqueAreas.flatMap((lifeArea) =>
      landscapeAnchors.map(async (anchor): Promise<LandscapeCellProjection> => {
        const candidates = notes.filter(
          (item) =>
            item.note.lifeAreas.includes(lifeArea) &&
            item.note.landscapeAnchor === anchor,
        );
        const projected = await orderedProjection(
          candidates,
          `landscape:${lifeArea}:${anchor}`,
          views,
        );
        const byId = new Map(candidates.map((item) => [item.note.id, item]));
        const cards = projected.map((card): LandscapeCardProjection => {
          const source = byId.get(card.noteId)!;
          const horizon = source.note.extraFrontmatter.decision_horizon;
          return {
            ...card,
            hash: source.hash,
            lifeAreas: [...source.note.lifeAreas],
            anchor,
            ...(isDecisionHorizon(horizon) ? { decisionHorizon: horizon } : {}),
          };
        });
        const featuredIndex = cards.findIndex(
          (card) => byId.get(card.noteId)?.note.display.featured === true,
        );
        if (featuredIndex > 0) {
          cards.unshift(cards.splice(featuredIndex, 1)[0]!);
        }
        return {
          lifeArea,
          anchor,
          featured: cards[0] ?? null,
          additionalCount: Math.max(0, cards.length - 1),
          noteIds: cards.map((card) => card.noteId),
          cards,
        };
      }),
    ),
  );
  return { cells };
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

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) =>
    typeof item === 'string' && item.trim() !== '' ? [item.trim()] : [],
  ))];
}

function reflectionEvidenceConnections(
  note: StudioNote,
  targetNotes: ReadonlyMap<string, readonly StudioNote[]>,
  lifeAreas: readonly ReflectionLifeAreaTarget[],
): ReflectionEvidenceConnection[] {
  const noteConnections = stringList(note.extraFrontmatter.related_notes).map(
    (id): ReflectionEvidenceConnection => {
      const targets = targetNotes.get(id) ?? [];
      const targetState = targets.some(
        (target) => target.status !== 'archived' && target.status !== 'trashed',
      )
        ? 'available'
        : targets.some((target) => target.status === 'archived')
          ? 'archived'
          : 'missing';
      return { kind: 'note', id, targetState };
    },
  );
  const lifeAreasById = new Map(lifeAreas.map((area) => [area.id, area]));
  const lifeAreaConnections = stringList(note.lifeAreas).map(
    (id): ReflectionEvidenceConnection => {
      const target = lifeAreasById.get(id);
      if (target === undefined) {
        return { kind: 'life-area', id, targetState: 'missing' };
      }
      return {
        kind: 'life-area',
        id,
        label: target.title,
        targetState: target.hidden ? 'archived' : 'available',
      };
    },
  );
  const seasonsById = new Map<string, StudioNote[]>();
  for (const targets of targetNotes.values()) {
    for (const target of targets) {
      if (target.cardType !== 'season') continue;
      const storedId = target.extraFrontmatter.season_id;
      const id =
        typeof storedId === 'string' && storedId.trim() !== ''
          ? storedId.trim()
          : target.id;
      const seasons = seasonsById.get(id) ?? [];
      seasons.push(target);
      seasonsById.set(id, seasons);
    }
  }
  const seasonConnections = stringList(note.seasons).map(
    (id): ReflectionEvidenceConnection => {
      const targets = seasonsById.get(id) ?? [];
      const available = targets.find((target) => target.status === 'active');
      if (available !== undefined) {
        return {
          kind: 'season',
          id,
          label: available.title?.trim() || id,
          targetState: 'available',
        };
      }
      const archived = targets.find((target) => target.status === 'archived');
      if (archived !== undefined) {
        return {
          kind: 'season',
          id,
          label: archived.title?.trim() || id,
          targetState: 'archived',
        };
      }
      return { kind: 'season', id, targetState: 'missing' };
    },
  );
  return [
    ...noteConnections,
    ...lifeAreaConnections,
    ...seasonConnections,
  ];
}

export async function projectUnchartedRoom(
  notes: LoadedNote[],
  views: ViewStateRepository,
): Promise<UnchartedProjection> {
  const candidates = notes.filter((item) => belongsToRoom(item.note, 'uncharted'));
  const ordered = await orderedProjection(candidates, 'room:uncharted', views);
  const byId = new Map(candidates.map((item) => [item.note.id, item]));
  return {
    cards: ordered.map((card) => {
      const source = byId.get(card.noteId)!;
      return {
        ...card,
        hash: source.hash,
        horizon: source.note.extraFrontmatter.beyond_gate === true
          ? 'beyond'
          : 'near',
        seasons: [...source.note.seasons],
      };
    }),
  };
}

export async function projectReflectionGardenRoom(
  notes: LoadedNote[],
  views: ViewStateRepository,
  lifeAreas: readonly ReflectionLifeAreaTarget[],
): Promise<ReflectionGardenProjection> {
  // A Garden is a chronology, not a manually arranged board. View order remains
  // disposable for other rooms but cannot override when an entry was created.
  void views;
  const candidates = notes.filter((item) =>
    belongsToRoom(item.note, 'reflection-garden'),
  );
  const ordered = dedupe(
    candidates.filter((item) => visible(item, 'room:reflection-garden')),
  )
    .sort((left, right) =>
      Date.parse(right.note.created) - Date.parse(left.note.created) ||
      left.note.id.localeCompare(right.note.id, 'en'),
    )
    .map(toCard);
  const byId = new Map(candidates.map((item) => [item.note.id, item]));
  const targetsById = new Map<string, StudioNote[]>();
  for (const item of notes) {
    const targets = targetsById.get(item.note.id) ?? [];
    targets.push(item.note);
    targetsById.set(item.note.id, targets);
  }
  const cards = ordered.map((card): ReflectionCardProjection => {
    const source = byId.get(card.noteId)!;
    const linkedNoteIds = stringList(source.note.extraFrontmatter.related_notes);
    const thenNoteId = source.note.extraFrontmatter.then_note_id;
    return {
      ...card,
      hash: source.hash,
      created: source.note.created,
      lifeAreas: [...source.note.lifeAreas],
      seasons: [...source.note.seasons],
      tags: [...source.note.tags],
      linkedNoteIds,
      evidenceConnections: reflectionEvidenceConnections(
        source.note,
        targetsById,
        lifeAreas,
      ),
      ...(typeof thenNoteId === 'string' && thenNoteId.trim() !== ''
        ? { thenNoteId }
        : {}),
      ...(source.note.display.cover === undefined
        ? {}
        : { coverReference: source.note.display.cover }),
    };
  });
  const themeCounts = new Map<string, number>();
  for (const card of cards) {
    for (const tag of new Set(card.tags)) {
      themeCounts.set(tag, (themeCounts.get(tag) ?? 0) + 1);
    }
  }
  const themes = [...themeCounts]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) =>
      right.count - left.count || left.name.localeCompare(right.name, 'en'),
    );
  return { cards, themes };
}

export async function projectCurrentSeason(
  notes: LoadedNote[],
): Promise<ActiveSeasonProjection> {
  const candidates = await orderedProjection(
    notes.filter(
      (item) =>
        item.note.cardType === 'season' &&
        item.note.status === 'active' &&
        item.note.rooms.includes('current-season'),
    ),
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
      notes.filter(
        (item) =>
          item.note.display.featured || item.note.rooms.includes('foyer'),
      ),
      'foyer:featured',
      views,
    ),
  ]);
  const eligible = notes.filter((item) => visible(item, 'foyer:featured'));
  const foyerNotes = eligible.filter(
    (item) => item.note.rooms.includes('foyer') || item.note.display.featured,
  );
  const orderedFoyer = await orderedProjection(
    foyerNotes,
    'foyer:featured',
    views,
  );
  const card = (predicate: (item: LoadedNote) => boolean) =>
    orderedFoyer.find((candidate) => {
      const source = foyerNotes.find(
        (item) => item.note.id === candidate.noteId,
      );
      return source !== undefined && predicate(source);
    }) ?? null;
  const cards = (predicate: (item: LoadedNote) => boolean, limit: number) =>
    orderedFoyer
      .filter((candidate) => {
        const source = foyerNotes.find(
          (item) => item.note.id === candidate.noteId,
        );
        return source !== undefined && predicate(source);
      })
      .slice(0, limit);
  const activeSeasonNote =
    activeSeason.current === null
      ? undefined
      : eligible.find((item) => item.note.id === activeSeason.current?.noteId)
          ?.note;
  const canonicalSeasonId =
    typeof activeSeasonNote?.extraFrontmatter.season_id === 'string'
      ? activeSeasonNote.extraFrontmatter.season_id.trim()
      : '';
  const declaredPriorityIds = new Set(
    Array.isArray(activeSeasonNote?.extraFrontmatter.priorities)
      ? activeSeasonNote.extraFrontmatter.priorities.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim() !== '',
        )
      : [],
  );
  const priorities =
    activeSeasonNote === undefined
      ? []
      : await orderedProjection(
          eligible.filter(
            (item) =>
              item.note.cardType === 'priority' &&
              (declaredPriorityIds.has(item.note.id) ||
                (canonicalSeasonId !== '' &&
                  item.note.seasons.includes(canonicalSeasonId))),
          ),
          `foyer:season:${canonicalSeasonId || activeSeasonNote.id}:priorities`,
          views,
        );
  const imageNote = foyerNotes.find(
    (item) => item.note.display.cover !== undefined,
  );
  return {
    currentSeason: activeSeason.current,
    featured: featuredCandidates.filter(
      (item) => item.noteId !== activeSeason.current?.noteId,
    ),
    becoming: card((item) => item.note.cardType === 'identity'),
    feelings: cards((item) => item.note.cardType === 'feeling', 8),
    principles: cards((item) => item.note.cardType === 'principle', 3),
    priorities: priorities.slice(0, 3),
    returning: card(
      (item) =>
        item.note.semanticType === 'reflection' ||
        item.note.semanticType === 'celebration',
    ),
    image:
      imageNote?.note.display.cover === undefined
        ? null
        : {
            noteId: imageNote.note.id,
            path: imageNote.path,
            hash: imageNote.hash,
            source: imageNote.note.display.cover,
            alt: imageNote.note.title?.trim() || 'A chosen Studio image',
            ...(imageNote.note.body.trim() === ''
              ? {}
              : {
                  caption: markdownToPlainText(imageNote.note.body).slice(
                    0,
                    120,
                  ),
                }),
          },
  };
}
