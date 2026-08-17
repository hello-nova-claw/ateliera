import type {
  IdentityStudioProjection,
  StudioService,
} from '@studio/application';
import type { IdentitySection } from '@studio/domain';
import { useCallback, useEffect, useState } from 'react';

function emptyProjection(): IdentityStudioProjection {
  return {
    currentlyBecoming: null,
    sections: {
      'already-true': [],
      'practicing-now': [],
      'values-principles': [],
      'desired-feelings': [],
      'beliefs-practice': [],
      'embodiment-cues': [],
      'identity-shifts': [],
    },
  };
}

const emptyIdentity = emptyProjection();

export interface IdentityView {
  add(
    section: IdentitySection,
    draft: { body: string; title?: string },
  ): Promise<void>;
  error?: string;
  model: IdentityStudioProjection;
  offline: boolean;
  promote(noteId: string): Promise<void>;
  reorder(section: IdentitySection, noteIds: string[]): Promise<void>;
  state: 'ready' | 'loading' | 'stale' | 'error';
}

export function useIdentity(
  service: StudioService | undefined,
  revision: number,
  online = true,
): IdentityView {
  const [localRevision, setLocalRevision] = useState(0);
  const [model, setModel] = useState(emptyIdentity);
  const [state, setState] = useState<IdentityView['state']>(
    service === undefined ? 'ready' : 'loading',
  );
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (service === undefined) {
      setModel(emptyIdentity);
      setState('ready');
      setError(undefined);
      return undefined;
    }
    let current = true;
    setState((previous) => (previous === 'ready' ? 'stale' : 'loading'));
    void service.projectIdentityStudio().then(
      (next) => {
        if (!current) return;
        setModel(next);
        setError(undefined);
        setState(service.indexState() === 'ready' ? 'ready' : 'stale');
      },
      (reason: unknown) => {
        if (!current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : 'Identity Studio could not be gathered.',
        );
        setState('error');
      },
    );
    return () => {
      current = false;
    };
  }, [localRevision, revision, service]);

  const refresh = useCallback(() => setLocalRevision((value) => value + 1), []);

  return {
    async add(section, draft) {
      if (service === undefined)
        throw new Error('Open a Studio before remembering this thought.');
      await service.capture({ ...draft, identitySection: section });
      refresh();
    },
    ...(error === undefined ? {} : { error }),
    model,
    offline: !online,
    async promote(noteId) {
      if (service === undefined)
        throw new Error('Open a Studio before choosing this thought.');
      await service.promoteIdentity(noteId);
      refresh();
    },
    async reorder(section, noteIds) {
      if (service === undefined)
        throw new Error('Open a Studio before rearranging this section.');
      await service.reorderIdentity(section, noteIds);
      refresh();
    },
    state,
  };
}
