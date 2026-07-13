import type {
  LandscapeBoardProjection,
  LifeAreaPreference,
  StudioService,
} from '@studio/application';
import {
  defaultLifeAreas,
  type LandscapeAnchor,
  type LifeArea,
} from '@studio/domain';
import { useCallback, useEffect, useState } from 'react';
import type { LandscapeMove } from './LandscapePage';

const defaultActiveAreas: LifeArea[] = [...defaultLifeAreas.slice(0, 5)];
const emptyBoard: LandscapeBoardProjection = { cells: [] };

function defaultPreferences(): LifeAreaPreference[] {
  return defaultLifeAreas.map((area, order) => ({
    ...area,
    hidden: order >= 5,
    order,
  }));
}

function activeAreas(preferences: readonly LifeAreaPreference[]): LifeArea[] {
  return preferences
    .filter((area) => !area.hidden)
    .sort((left, right) => left.order - right.order)
    .map(({ id, title }) => ({ id, title }));
}

function safeAreaId(
  title: string,
  preferences: readonly LifeAreaPreference[],
): string {
  const base =
    title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLocaleLowerCase('en')
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 56) || 'area';
  const ids = new Set(preferences.map((area) => area.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function useLandscape(
  service: StudioService | undefined,
  revision: number,
) {
  const [areas, setAreas] = useState<LifeArea[]>(defaultActiveAreas);
  const [preferences, setPreferences] =
    useState<LifeAreaPreference[]>(defaultPreferences);
  const [areaRevision, setAreaRevision] = useState<string | null>(null);
  const [board, setBoard] = useState<LandscapeBoardProjection>(emptyBoard);
  const [localRevision, setLocalRevision] = useState(0);
  const [state, setState] = useState<'ready' | 'loading' | 'stale' | 'error'>(
    service ? 'loading' : 'ready',
  );
  const [error, setError] = useState<string>();
  const refresh = useCallback(() => setLocalRevision((value) => value + 1), []);

  useEffect(() => {
    if (!service) {
      setAreas(defaultActiveAreas);
      setPreferences(defaultPreferences());
      setAreaRevision(null);
      setBoard(emptyBoard);
      setState('ready');
      return undefined;
    }
    let current = true;
    setState('loading');
    void service.lifeAreas
      .load()
      .then(async (snapshot) => {
        const selected = activeAreas(snapshot.areas);
        const next = await service.projectLandscapeBoard(
          selected.map((area) => area.id),
        );
        if (!current) return;
        setPreferences(snapshot.areas);
        setAreaRevision(snapshot.revision);
        setAreas(selected);
        setBoard(next);
        setError(undefined);
        setState(service.indexState() === 'ready' ? 'ready' : 'stale');
      })
      .catch((reason: unknown) => {
        if (!current) return;
        setState('error');
        setError(
          reason instanceof Error
            ? reason.message
            : 'The Landscape could not be gathered.',
        );
      });
    return () => {
      current = false;
    };
  }, [localRevision, revision, service]);

  async function savePreferences(next: LifeAreaPreference[]) {
    if (!service)
      throw new Error('Choose a Studio before changing life areas.');
    const ordered = [...next]
      .sort((left, right) => left.order - right.order)
      .map((area, order) => ({ ...area, order }));
    try {
      const saved = await service.lifeAreas.save(ordered, areaRevision);
      setPreferences(saved.areas);
      setAreaRevision(saved.revision);
      setAreas(activeAreas(saved.areas));
      setError(undefined);
      refresh();
    } catch (reason) {
      setState('error');
      setError(
        reason instanceof Error
          ? reason.message
          : 'The life area change could not be saved.',
      );
      throw reason;
    }
  }

  return {
    areas,
    board,
    error,
    state,
    refresh,
    addArea: async ({ id, title }: { id?: string; title: string }) => {
      const existing =
        id === undefined
          ? undefined
          : preferences.find((area) => area.id === id);
      if (existing !== undefined) {
        if (!existing.hidden) return;
        await savePreferences(
          preferences.map((area) =>
            area.id === id ? { ...area, hidden: false } : area,
          ),
        );
        return;
      }
      const nextId = id ?? safeAreaId(title, preferences);
      await savePreferences([
        ...preferences,
        { id: nextId, title, hidden: false, order: preferences.length },
      ]);
    },
    removeArea: async (id: string) => {
      if (areas.length <= 1) return;
      await savePreferences(
        preferences.map((area) =>
          area.id === id ? { ...area, hidden: true } : area,
        ),
      );
    },
    renameArea: async (id: string, title: string) => {
      await savePreferences(
        preferences.map((area) => (area.id === id ? { ...area, title } : area)),
      );
    },
    reorderArea: async (id: string, offset: -1 | 1) => {
      const index = areas.findIndex((area) => area.id === id);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= areas.length) return;
      const nextActive = [...areas];
      [nextActive[index], nextActive[target]] = [
        nextActive[target]!,
        nextActive[index]!,
      ];
      const activeOrder = new Map(
        nextActive.map((area, order) => [area.id, order]),
      );
      const hidden = preferences.filter((area) => area.hidden);
      await savePreferences([
        ...nextActive.map((area) => ({
          ...preferences.find((item) => item.id === area.id)!,
          order: activeOrder.get(area.id)!,
        })),
        ...hidden.map((area, hiddenIndex) => ({
          ...area,
          order: nextActive.length + hiddenIndex,
        })),
      ]);
    },
    move: async (move: LandscapeMove) => {
      if (!service) throw new Error('Choose a Studio before moving this note.');
      const saved = await service.updateLandscapePlacement({
        path: move.card.path,
        expectedHash: move.card.hash,
        lifeAreas: move.lifeAreas,
        anchor: move.anchor,
      });
      refresh();
      return { hash: saved.hash };
    },
    reorder: async (
      lifeArea: string,
      anchor: LandscapeAnchor,
      noteIds: string[],
    ) => {
      if (!service) return;
      await service.views.save(`landscape:${lifeArea}:${anchor}`, noteIds);
      refresh();
    },
  };
}
