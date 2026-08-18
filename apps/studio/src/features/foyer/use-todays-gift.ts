import { useEffect, useState } from 'react';
import type { StudioService } from '@studio/application';
import { buildResurfacePool } from '@studio/application';
import { computeRhythmContext, selectResurface, type RhythmProfile } from '@studio/rhythm';

export interface Gift {
  kind: 'dream' | 'resurfaced' | 'line';
  payload: { text: string };
  sourcePath?: string;
}

const CALM_GIFT: Gift = { kind: 'line', payload: { text: 'A quiet place to begin.' } };

export interface UseTodaysGift {
  gift: Gift | null;
  keep: () => Promise<void>;
}

export function useTodaysGift(
  service: StudioService | undefined,
  today: string,
): UseTodaysGift {
  const [gift, setGift] = useState<Gift | null>(null);

  useEffect(() => {
    if (service === undefined) return undefined;
    let current = true;
    void (async () => {
      const snapshot = await service.rhythmProfile.load();
      if (snapshot.profile === null) {
        if (current) setGift(null);
        return;
      }
      const profile: RhythmProfile = {
        location: { hemisphere: snapshot.profile.hemisphere },
        cycle: snapshot.profile.cycle,
        natal: snapshot.profile.natal,
      };
      const ctx = computeRhythmContext(profile, today);
      let card: ReturnType<typeof selectResurface> = null;
      try {
        const pool = await buildResurfacePool(service.index);
        card = selectResurface(pool, ctx, today);
      } catch {
        // Index query failed — resurfacing is a nice-to-have layer, never a
        // hard dependency for the Foyer to render (spec §9). Falls through
        // to the calm fallback below, same as an empty pool.
      }
      if (card === null) {
        if (current) setGift(CALM_GIFT);
        return;
      }
      const loaded = await service.load(card.sourcePath);
      if (!current) return;
      setGift({
        kind: card.kind === 'dream' ? 'dream' : 'resurfaced',
        payload: { text: loaded.note.body },
        sourcePath: card.sourcePath,
      });
    })();
    return () => {
      current = false;
    };
  }, [service, today]);

  return {
    gift,
    async keep() {
      if (service === undefined || gift === null || gift.kind === 'line') return;
      await service.capture({
        body: gift.payload.text,
        placement: gift.kind === 'dream' ? 'uncharted' : 'reflection',
      });
    },
  };
}
