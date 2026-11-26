/**
 * The work "of the day": a pick that depends only on the provider, the kind,
 * the local date and (when it rotates) the slot of the day, so it is the same
 * all day, on every machine, and changes at local midnight. No randomness:
 * a restart, a second panel or a test gets the same work.
 */
import type { Kind } from './types.ts';
import { localDate, localHour } from './time.ts';

/** FNV-1a, 32 bits. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A well-mixed 32-bit number from a string (FNV-1a and a final avalanche), so neighbouring days land far apart. */
export function hash32(s: string): number {
  let h = fnv1a(s);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** An index in `0..n-1` for a seed; `attempt` gives the next candidates when one doesn't suit. */
export function pickIndex(seed: string, n: number, attempt = 0): number {
  if (n <= 0) return 0;
  return hash32(attempt ? `${seed}#${attempt}` : seed) % n;
}

/** Which slot of the day `now` is in: the date, and the slot when rotating every `everyHours`. */
export function slotOf(now: number, zone: string, everyHours: number): { date: string; slot: number } {
  const date = localDate(now, zone);
  const every = Math.max(0, Math.floor(everyHours));
  return { date, slot: every > 0 && every < 24 ? Math.floor(localHour(now, zone) / every) : 0 };
}

/** The key of what to show: a new key, a new work. */
export function workKey(provider: string, kind: Kind, date: string, slot: number): string {
  return `${provider}|${kind}|${date}|${slot}`;
}

/** The seed a provider picks with, from the key (the provider's own ids stay out of it). */
export const seedOf = (key: string): string => `kiosko-art|${key}`;
