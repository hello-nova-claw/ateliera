import type { FoyerProjection, StudioService } from '@studio/application';
import { useEffect, useState } from 'react';

export const emptyFoyer: FoyerProjection = {
  currentSeason: null,
  featured: [],
  becoming: null,
  feelings: [],
  principles: [],
  priorities: [],
  returning: null,
  image: null,
};

export interface FoyerView {
  model: FoyerProjection;
  state: 'ready' | 'loading' | 'stale' | 'error';
  error?: string;
}

export function useFoyer(service: StudioService | undefined, revision: number): FoyerView {
  const [view, setView] = useState<FoyerView>(() => ({
    model: emptyFoyer,
    state: service === undefined ? 'ready' : 'loading',
  }));

  useEffect(() => {
    if (service === undefined) {
      setView({ model: emptyFoyer, state: 'ready' });
      return undefined;
    }
    let current = true;
    setView((previous) => ({ model: previous.model, state: 'loading' }));
    void service.projectFoyer().then((model) => {
      if (!current) return;
      const indexState = service.indexState();
      setView({ model, state: indexState === 'ready' ? 'ready' : 'stale' });
    }).catch((reason: unknown) => {
      if (!current) return;
      setView({
        model: emptyFoyer,
        state: 'error',
        error: reason instanceof Error ? reason.message : 'The Foyer could not be gathered.',
      });
    });
    return () => { current = false; };
  }, [revision, service]);

  return view;
}
