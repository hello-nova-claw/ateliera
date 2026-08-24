import { useEffect, useState } from 'react';
import type { StoredStudioPreferences, StudioService } from '@studio/application';

export interface UseStudioPreferences {
  preferences: StoredStudioPreferences;
  revision: string | null;
  save: (next: StoredStudioPreferences) => Promise<void>;
}

export function useStudioPreferences(
  service: StudioService | undefined,
): UseStudioPreferences {
  const [preferences, setPreferences] = useState<StoredStudioPreferences>({});
  const [revision, setRevision] = useState<string | null>(null);

  useEffect(() => {
    if (service === undefined) return undefined;
    let current = true;
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
    };
  }, [service]);

  return {
    preferences,
    revision,
    async save(next) {
      if (service === undefined) return;
      const snapshot = await service.preferences.save(next, revision);
      setPreferences(snapshot.preferences);
      setRevision(snapshot.revision);
    },
  };
}
