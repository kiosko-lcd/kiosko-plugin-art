/**
 * A museum: how to pick one of its public-domain works for a seed, and what
 * its terms ask to show with it. The source, its cache and fetch plan, the
 * widget and the interlude work with any of them; a new museum is a new
 * module here, listed in `index.ts`.
 */
import type { Localized } from '@kiosko/sdk';
import type { Net } from '../net.ts';
import type { Kind, Work } from '../types.ts';

/** Small things a provider remembers between days (how many works a query has), kept on disk with the cache. */
export interface Memo {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
}

export interface PickContext {
  net: Net;
  memo: Memo;
  /** For how long remembered counts last. */
  now: number;
  signal?: AbortSignal;
  log?: (m: string) => void;
}

/** This candidate isn't one to show (not public domain, no image, a strip of a scroll): try the next. */
export class Unsuitable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Unsuitable';
  }
}

export interface ArtProvider {
  id: string;
  /** For the editor: "The Met (New York)". */
  name: Localized;
  /** Hosts it contacts (the plugin's `permissions.network`). */
  hosts: string[];
  /** The kinds it has, the first being its default. */
  kinds: Kind[];
  /** Headers its image server asks for (the Art Institute of Chicago's `AIC-User-Agent`). */
  imageHeaders?: Record<string, string>;
  /**
   * The work for `seed`, the `attempt`-th candidate (0 first). Throws
   * `Unsuitable` for one not to show, anything else when the museum can't be
   * reached.
   */
  pick(kind: Kind, seed: string, attempt: number, ctx: PickContext): Promise<Work>;
}

/** How long a count of works (or a page count) is trusted before asking again. */
export const COUNT_TTL_MS = 7 * 24 * 3_600_000;

/** A remembered number, or the result of `ask` (remembered for a week). */
export async function remembered<T>(memo: Memo, key: string, now: number, ask: () => Promise<T>): Promise<T> {
  const hit = memo.get<{ at: number; value: T }>(key);
  if (hit && now - hit.at < COUNT_TTL_MS) return hit.value;
  const value = await ask();
  memo.set(key, { at: now, value });
  return value;
}

export const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
