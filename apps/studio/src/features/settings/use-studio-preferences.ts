import { useEffect, useState } from 'react';
import type { StoredStudioPreferences, StudioService } from '@studio/application';

export interface UseStudioPreferences {
  preferences: StoredStudioPreferences;
  revision: string | null;
  save: (next: StoredStudioPreferences) => Promise<void>;
}

interface PreferencesSnapshot {
  preferences: StoredStudioPreferences;
  revision: string | null;
}

type Listener = (snapshot: PreferencesSnapshot) => void;

// The navigation, the Foyer and Settings each hold their own copy. A save in one
// must reach the others, or a room turned on in Settings stays out of the
// navigation and the next save from a stale copy conflicts on its old revision.
const listeners = new WeakMap<StudioService, Set<Listener>>();

function subscribe(service: StudioService, listener: Listener): () => void {
  let set = listeners.get(service);
  if (set === undefined) {
    set = new Set();
    listeners.set(service, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

export function useStudioPreferences(
  service: StudioService | undefined,
): UseStudioPreferences {
  const [preferences, setPreferences] = useState<StoredStudioPreferences>({});
  const [revision, setRevision] = useState<string | null>(null);

  useEffect(() => {
    if (service === undefined) return undefined;
    let current = true;
    const unsubscribe = subscribe(service, (snapshot) => {
      setPreferences(snapshot.preferences);
      setRevision(snapshot.revision);
    });
    void service.preferences
      .load()
      .then((snapshot) => {
        if (!current) return;
        setPreferences(snapshot.preferences);
        setRevision(snapshot.revision);
      })
      .catch(() => {
        // Preferences that can't be loaded degrade to "all defaults" — every room
        // and rhythm layer stays visible and a fresh save recovers the file.
      });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [service]);

  return {
    preferences,
    revision,
    async save(next) {
      if (service === undefined) return;
      const snapshot = await service.preferences.save(next, revision);
      const shared = {
        preferences: snapshot.preferences,
        revision: snapshot.revision,
      };
      for (const listener of listeners.get(service) ?? []) listener(shared);
    },
  };
}
