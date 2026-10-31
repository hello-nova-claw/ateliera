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

/** How many hooks share saves for this Studio. Exposed for tests. */
export function sharedPreferencesListenerCount(service: StudioService): number {
  return listeners.get(service)?.size ?? 0;
}

// The last snapshot read or saved for each Studio. A copy that mounts later
// starts from it instead of from defaults.
const latest = new WeakMap<StudioService, PreferencesSnapshot>();

const defaults: PreferencesSnapshot = { preferences: {}, revision: null };

function known(service: StudioService | undefined): PreferencesSnapshot {
  return (service === undefined ? undefined : latest.get(service)) ?? defaults;
}

/**
 * Reads a Studio's preferences before its rooms first draw. Without it the
 * navigation and the Foyer draw every room, then drop the ones turned off a
 * moment later, and the links move under the pointer. A failed read leaves
 * the defaults, as the hook's own load does.
 */
export async function preloadStudioPreferences(
  service: StudioService,
): Promise<void> {
  try {
    const snapshot = await service.preferences.load();
    latest.set(service, {
      preferences: snapshot.preferences,
      revision: snapshot.revision,
    });
  } catch {
    // The hook loads again when it mounts.
  }
}

export function useStudioPreferences(
  service: StudioService | undefined,
): UseStudioPreferences {
  const [held, setHeld] = useState(() => ({
    service,
    snapshot: known(service),
  }));
  const { preferences, revision } =
    held.service === service ? held.snapshot : known(service);

  useEffect(() => {
    if (service === undefined) return undefined;
    let current = true;
    // A save shared while the load is in flight is newer than what the load
    // will return, so the load result is dropped.
    let shared = false;
    const unsubscribe = subscribe(service, (snapshot) => {
      shared = true;
      setHeld({ service, snapshot });
    });
    void service.preferences
      .load()
      .then((loaded) => {
        if (!current || shared) return;
        const snapshot = {
          preferences: loaded.preferences,
          revision: loaded.revision,
        };
        latest.set(service, snapshot);
        setHeld({ service, snapshot });
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
      latest.set(service, shared);
      for (const listener of listeners.get(service) ?? []) listener(shared);
    },
  };
}
