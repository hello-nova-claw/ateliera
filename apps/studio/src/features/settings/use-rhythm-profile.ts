import { useEffect, useState } from 'react';
import type { StoredRhythmProfile, StudioService } from '@studio/application';

export interface UseRhythmProfile {
  profile: StoredRhythmProfile | null;
  revision: string | null;
  save: (next: StoredRhythmProfile) => Promise<void>;
}

export function useRhythmProfile(
  service: StudioService | undefined,
): UseRhythmProfile {
  const [profile, setProfile] = useState<StoredRhythmProfile | null>(null);
  const [revision, setRevision] = useState<string | null>(null);

  useEffect(() => {
    if (service === undefined) return undefined;
    let current = true;
    void service.rhythmProfile
      .load()
      .then((snapshot) => {
        if (!current) return;
        setProfile(snapshot.profile);
        setRevision(snapshot.revision);
      })
      .catch(() => {
        // A profile that can't be loaded degrades to "none saved yet" — the
        // Settings form still renders and a fresh save recovers it.
      });
    return () => {
      current = false;
    };
  }, [service]);

  return {
    profile,
    revision,
    async save(next) {
      if (service === undefined) return;
      const snapshot = await service.rhythmProfile.save(next, revision);
      setProfile(snapshot.profile);
      setRevision(snapshot.revision);
    },
  };
}
