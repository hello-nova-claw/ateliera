import type {
  CaptureNoteInput,
  SavedNote,
  StudioService,
  WisdomGardenProjection,
  WisdomThemePreference,
} from '@studio/application';
import { useCallback, useEffect, useState } from 'react';

const empty: WisdomGardenProjection = { cards: [], themes: [] };

export type WisdomState = 'ready' | 'loading' | 'stale' | 'repair' | 'error';

export interface WisdomView {
  capture(input: CaptureNoteInput): Promise<SavedNote | undefined>;
  error?: string;
  model: WisdomGardenProjection;
  saveThemes(themes: readonly WisdomThemePreference[]): Promise<void>;
  state: WisdomState;
  themes: WisdomThemePreference[];
}

export function useWisdom(
  service: StudioService | undefined,
  revision: number,
): WisdomView {
  const [localRevision, setLocalRevision] = useState(0);
  const [model, setModel] = useState(empty);
  const [themes, setThemes] = useState<WisdomThemePreference[]>([]);
  const [themeRevision, setThemeRevision] = useState<string | null>(null);
  const [state, setState] = useState<WisdomState>(
    service ? 'loading' : 'ready',
  );
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!service) {
      setModel(empty);
      setThemes([]);
      setState('ready');
      return undefined;
    }
    let current = true;
    setState('loading');
    setError(undefined);
    void Promise.all([
      service.projectWisdomGarden(),
      service.wisdomThemes.load(),
      service.repairs(),
    ]).then(
      ([projection, themeSnapshot, repairs]) => {
        if (!current) return;
        setModel(projection);
        setThemes(themeSnapshot.themes);
        setThemeRevision(themeSnapshot.revision);
        const noteRepair = repairs.some((item) =>
          item.path.toLocaleLowerCase('en').startsWith('wisdom garden/'),
        );
        if (themeSnapshot.repairRequired || noteRepair) {
          setState('repair');
          setError(
            themeSnapshot.repairRequired
              ? 'Some Wisdom Garden settings need repair.'
              : 'One or more Wisdom notes need metadata repair. Their words remain untouched.',
          );
        } else {
          setState(service.indexState() === 'ready' ? 'ready' : 'stale');
        }
      },
      (reason: unknown) => {
        if (!current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : 'The Wisdom Garden could not be gathered.',
        );
        setState('error');
      },
    );
    return () => {
      current = false;
    };
  }, [localRevision, revision, service]);

  const capture = useCallback(
    async (input: CaptureNoteInput) => {
      if (!service) return undefined;
      const saved = await service.capture(input);
      setLocalRevision((value) => value + 1);
      return saved;
    },
    [service],
  );

  const saveThemes = useCallback(
    async (nextThemes: readonly WisdomThemePreference[]): Promise<void> => {
      if (!service) return;
      const saved = await service.wisdomThemes.save(nextThemes, themeRevision);
      setThemes(saved.themes);
      setThemeRevision(saved.revision);
      setState(saved.repairRequired ? 'repair' : 'ready');
    },
    [service, themeRevision],
  );

  return {
    capture,
    ...(error === undefined ? {} : { error }),
    model,
    saveThemes,
    state,
    themes,
  };
}
