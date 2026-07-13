import type { LandscapeBoardProjection, StudioService } from '@studio/application';
import { defaultLifeAreas, type LandscapeAnchor, type LifeArea } from '@studio/domain';
import { useCallback, useEffect, useState } from 'react';
import type { LandscapeMove } from './LandscapePage';

const defaultActiveAreas: LifeArea[] = [...defaultLifeAreas.slice(0, 5)];
const emptyBoard: LandscapeBoardProjection = { cells: [] };
const areaViewKey = 'landscape:active-areas';

export function useLandscape(service: StudioService | undefined, revision: number) {
  const [areas, setAreas] = useState<LifeArea[]>(defaultActiveAreas);
  const [board, setBoard] = useState<LandscapeBoardProjection>(emptyBoard);
  const [localRevision, setLocalRevision] = useState(0);
  const [state, setState] = useState<'ready' | 'loading' | 'stale' | 'error'>(service ? 'loading' : 'ready');
  const [error, setError] = useState<string>();
  const refresh = useCallback(() => setLocalRevision((value) => value + 1), []);

  useEffect(() => {
    if (!service) {
      setAreas(defaultActiveAreas);
      setBoard(emptyBoard);
      setState('ready');
      return undefined;
    }
    let current = true;
    setState('loading');
    void service.views.load(areaViewKey).then(async (stored) => {
      const selected = stored.length === 0
        ? defaultActiveAreas
        : stored.flatMap((id) => {
            const known = defaultLifeAreas.find((area) => area.id === id);
            return known ? [{ ...known }] : [{ id, title: id }];
          });
      const next = await service.projectLandscapeBoard(selected.map((area) => area.id));
      if (!current) return;
      setAreas(selected);
      setBoard(next);
      setError(undefined);
      setState(service.indexState() === 'ready' ? 'ready' : 'stale');
    }).catch((reason: unknown) => {
      if (!current) return;
      setState('error');
      setError(reason instanceof Error ? reason.message : 'The Landscape could not be gathered.');
    });
    return () => { current = false; };
  }, [localRevision, revision, service]);

  async function saveAreas(next: LifeArea[]) {
    if (!service) return;
    await service.views.save(areaViewKey, next.map((area) => area.id));
    setAreas(next);
    refresh();
  }

  return {
    areas,
    board,
    error,
    state,
    refresh,
    addArea: async (id: string) => {
      if (areas.some((area) => area.id === id)) return;
      const known = defaultLifeAreas.find((area) => area.id === id);
      await saveAreas([...areas, known ? { ...known } : { id, title: id }]);
    },
    removeArea: async (id: string) => {
      if (areas.length <= 1) return;
      await saveAreas(areas.filter((area) => area.id !== id));
    },
    reorderArea: async (id: string, offset: -1 | 1) => {
      const index = areas.findIndex((area) => area.id === id);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= areas.length) return;
      const next = [...areas];
      [next[index], next[target]] = [next[target]!, next[index]!];
      await saveAreas(next);
    },
    move: async (move: LandscapeMove) => {
      if (!service) return;
      await service.updateLandscapePlacement({ path: move.card.path, lifeAreas: move.lifeAreas, anchor: move.anchor });
      refresh();
    },
    reorder: async (lifeArea: string, anchor: LandscapeAnchor, noteIds: string[]) => {
      if (!service) return;
      await service.views.save(`landscape:${lifeArea}:${anchor}`, noteIds);
      refresh();
    },
  };
}
