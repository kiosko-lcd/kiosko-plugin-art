/**
 * How big today's image must be: the widget and the interlude note the sizes
 * they paint at, and the source asks the museum for an image to suit the
 * largest panel that used it lately (no bigger), in a few steps
 * (`PX_STEPS`), so a slightly bigger tile doesn't mean another download.
 */
import { DEFAULT_PX, PX_STEPS, stepFor } from './image.ts';

/** A size noted this long ago no longer counts (a tile moved, a panel unplugged). */
const FORGET_MS = 24 * 3_600_000;
const seen = new Map<string, { px: number; at: number }>();

/** Notes a box the work was painted in. Cheap: called on every paint. */
export function noteBox(w: number, h: number, now: number): void {
  const px = Math.round(Math.max(w, h));
  if (!(px > 0)) return;
  const k = String(stepFor(px));
  const had = seen.get(k);
  // Only every few minutes for the same step: a paint mustn't cost a Map write.
  if (!had || now - had.at > 5 * 60_000) seen.set(k, { px, at: now });
}

/** The long edge to ask for: the largest box noted in the last day, as a step; `DEFAULT_PX` before any. */
export function wantedPx(now: number): number {
  let px = 0;
  for (const [k, v] of seen) {
    if (now - v.at > FORGET_MS) seen.delete(k);
    else px = Math.max(px, v.px);
  }
  return px ? stepFor(px) : DEFAULT_PX;
}

/** For the tests. */
export function forgetBoxes(): void {
  seen.clear();
}

export { PX_STEPS };
