import { useEffect, useState } from 'react';
import type { StudioService } from '@studio/application';
import { buildResurfacePool } from '@studio/application';
import { markdownToPlainText } from '@studio/content';
import {
  computeRhythmContext,
  selectResurface,
  sm2Interval,
  type RhythmProfile,
} from '@studio/rhythm';

export type Gift =
  | { kind: 'line'; payload: { title: string; excerpt: string } }
  | {
      kind: 'dream' | 'resurfaced';
      payload: { title: string; excerpt: string };
      /** Full, untruncated Markdown body — used only by keep(), never displayed. */
      body: string;
      sourcePath: string;
      intervalDays: number;
    };

const CALM_GIFT: Gift = {
  kind: 'line',
  payload: { title: 'A quiet place to begin.', excerpt: '' },
};

// SM-2 quality is a 0-5 recall grade; there is no grading UI on the Gift, so
// Keep always records a fixed "good recall" pass (>= 3 passes; 5 is
// "perfect, no hesitation"; 4 sits comfortably in between without claiming
// a precision the interaction can't back up).
const KEEP_QUALITY = 4;

function addDaysISO(date: string, days: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

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
      try {
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
        const plain = markdownToPlainText(loaded.note.body);
        setGift({
          kind: card.kind === 'dream' ? 'dream' : 'resurfaced',
          payload: {
            title: loaded.note.title?.trim() || plain.slice(0, 80) || 'Untitled',
            excerpt: plain.slice(0, 240),
          },
          body: loaded.note.body,
          sourcePath: card.sourcePath,
          intervalDays: card.intervalDays,
        });
      } catch {
        // A broken rhythm-profile read, or a source note that's been
        // deleted/renamed/moved on disk since it was indexed, is the same
        // class of failure as an empty pool — fall back to the calm Gift
        // rather than leaving the slot silently absent (spec §9).
        if (current) setGift(CALM_GIFT);
      }
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
        body: gift.body,
        placement: gift.kind === 'dream' ? 'uncharted' : 'reflection',
      });
      // Keep is the acknowledgment action: it both creates the new card
      // above and advances the source card's own due date, so the same
      // card doesn't resurface again until its next interval elapses.
      const source = await service.load(gift.sourcePath);
      const nextIntervalDays = sm2Interval(gift.intervalDays, KEEP_QUALITY);
      await service.save({
        note: {
          ...source.note,
          resurfaceDue: addDaysISO(today, nextIntervalDays),
          resurfaceIntervalDays: nextIntervalDays,
        },
        path: source.path,
        expectedHash: source.hash,
      });
    },
  };
}
