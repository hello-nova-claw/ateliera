import type { ResurfaceCard, ResurfaceKind, RhythmContext } from './types';

/**
 * SM-2-style due check. dueDate and today are ISO `YYYY-MM-DD` strings, so a
 * plain lexical comparison is a correct date comparison. A card is due when its
 * dueDate is today or earlier.
 */
export function isDue(card: ResurfaceCard, today: string): boolean {
  return card.dueDate <= today;
}

const SM2_EASE = 2.5; // classic SM-2 default ease factor
const SM2_FIRST_PASS_DAYS = 6; // second successful interval in the SM-2 sequence

/**
 * SM-2-style interval grader. `quality` is a 0–5 recall grade. A failing grade
 * (< 3) resets the card to a 1-day interval; a passing grade grows it: the first
 * pass jumps to a fixed 6-day step, subsequent passes multiply by the ease factor.
 */
export function sm2Interval(prevIntervalDays: number, quality: number): number {
  if (quality < 3) return 1;
  if (prevIntervalDays <= 1) return SM2_FIRST_PASS_DAYS;
  return Math.round(prevIntervalDays * SM2_EASE);
}

// The four kinds, ordered from "strongest proof" to "intention".
const ALL_KINDS: readonly ResurfaceKind[] = ['evidence', 'reframe', 'wish', 'dream'];

/**
 * Deterministic rhythm → preferred-kind ranking. Returns an ordered preference
 * list (most-preferred kind first). Inward/closing rhythms (deep winter, late
 * luteal, full moon) prefer `evidence` — the strongest proof of what's gathered.
 * Outward/opening rhythms (spring, follicular, new moon) prefer `wish` — the
 * intention to surface. Each signal contributes a weight per kind; kinds are
 * then sorted by total weight, ties broken by the fixed ALL_KINDS order, so the
 * output depends only on ctx — never on randomness.
 */
export function preferredKinds(ctx: RhythmContext): ResurfaceKind[] {
  const weight: Record<ResurfaceKind, number> = { evidence: 0, reframe: 0, wish: 0, dream: 0 };

  // Season: deep winter closes inward (proof); spring opens outward (wishes).
  if (ctx.season === 'winter' || ctx.season === 'autumn') weight.evidence += 2;
  if (ctx.season === 'spring' || ctx.season === 'summer') weight.wish += 2;

  // Cycle phase: late luteal asks for proof; follicular asks for intention.
  if (ctx.cycle?.phase === 'luteal' || ctx.cycle?.phase === 'menstrual') weight.evidence += 2;
  if (ctx.cycle?.phase === 'follicular' || ctx.cycle?.phase === 'ovulation') weight.wish += 2;

  // Moon: full = what's gathered (evidence); new = intention (wish).
  if (ctx.moon.phase === 'full' || ctx.moon.phase === 'waning-gibbous') weight.evidence += 3;
  if (ctx.moon.phase === 'new' || ctx.moon.phase === 'waxing-crescent') weight.wish += 3;

  return [...ALL_KINDS].sort((a, b) => {
    if (weight[b] !== weight[a]) return weight[b] - weight[a];
    return ALL_KINDS.indexOf(a) - ALL_KINDS.indexOf(b);
  });
}

/**
 * Return one due ResurfaceCard, or null when none are due / the pool is empty.
 * Due cards (dueDate <= today) are ranked by the rhythm-preferred kind order,
 * ties broken by sourcePath, so the same cards/ctx/today always yield the same
 * card — rhythm-driven, never a slot-machine.
 */
export function selectResurface(
  cards: ResurfaceCard[],
  ctx: RhythmContext,
  today: string,
): ResurfaceCard | null {
  const due = cards.filter((c) => isDue(c, today));
  if (due.length === 0) return null;
  const order = preferredKinds(ctx);
  const rank = (k: ResurfaceKind) => order.indexOf(k);
  return (
    [...due].sort((a, b) => {
      if (rank(a.kind) !== rank(b.kind)) return rank(a.kind) - rank(b.kind);
      return a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0;
    })[0] ?? null
  );
}
