/**
 * Getting the work of the day without bothering the museums: the record and
 * the image are kept on disk, and the network is asked only when the key
 * changes (a new day, or a new slot when rotating), or when a panel needs a
 * bigger image than the one kept.
 *
 * - A pick tries up to `MAX_TRIES` candidates (not public domain, no image,
 *   a strip of a scroll: the next one), each a few small requests.
 * - When the museum fails, the last work stays on screen (marked stale) and
 *   it is asked again after 5 minutes, then 10, 20… up to 3 hours, or when
 *   it says to come back (`Retry-After`).
 */
import { HttpError } from '@kiosko/sdk';
import { imageDims, imageUrls, unsuitable } from './image.ts';
import type { Net } from './net.ts';
import { hash32, seedOf, workKey } from './pick.ts';
import type { ArtProvider, Memo } from './providers/provider.ts';
import { Unsuitable } from './providers/provider.ts';
import { emptyState, type State, type Store } from './store.ts';
import type { ArtData, Kind, Work } from './types.ts';

export const MAX_TRIES = 8;
export const FIRST_RETRY_MS = 5 * 60_000;
export const MAX_RETRY_MS = 3 * 3_600_000;

/** How long to wait after `failures` failures in a row. */
export function backoffMs(failures: number): number {
  return Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** Math.max(0, failures - 1));
}

export interface TodayCtx {
  now: number;
  /** The long edge the panels need (see `wantedPx`). */
  px: number;
  signal?: AbortSignal;
  log?: (m: string) => void;
}

export interface Deps {
  net: Net;
  store: Store;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function memoOf(s: State): Memo {
  return {
    get: <T>(k: string) => s.memo[k] as T | undefined,
    set: (k, v) => {
      if (v === undefined) delete s.memo[k];
      else s.memo[k] = v;
    },
  };
}

const extOf = (buf: Buffer) => (buf[0] === 0x89 ? 'png' : buf[0] === 0x47 ? 'gif' : buf[0] === 0x52 ? 'webp' : 'jpg');

/** Downloads the image of `work` at about `px`, falling back to smaller sizes; checks it is a real image of a usable size. */
export async function downloadImage(provider: ArtProvider, work: Work, px: number, ctx: TodayCtx, deps: Deps): Promise<{ buf: Buffer; px: number; url: string }> {
  let last: unknown = new Unsuitable(`${provider.id} ${work.id}: no image URL`);
  for (const c of imageUrls(work.image, px)) {
    try {
      const buf = await deps.net.bytes(c.url, { ...(provider.imageHeaders ? { headers: provider.imageHeaders } : {}), ...(ctx.signal ? { signal: ctx.signal } : {}) });
      const dims = imageDims(buf);
      if (!dims) throw new Unsuitable(`${provider.id} ${work.id}: not an image`);
      const why = unsuitable(dims.w / dims.h, dims);
      if (why) throw new Unsuitable(`${provider.id} ${work.id}: ${why}`);
      return { buf, px: Math.max(dims.w, dims.h), url: c.url };
    } catch (err) {
      last = err;
      // A size refused or too big: the next, smaller one. A rate limit or the network down: give up now.
      if (err instanceof HttpError && (err.status === 429 || err.status === 503)) throw err;
      ctx.log?.(`${c.url}: ${message(err)}`);
    }
  }
  throw last;
}

/** Picks and downloads the work for `key`: the first suitable candidate. */
async function fetchWork(provider: ArtProvider, kind: Kind, key: string, s: State, ctx: TodayCtx, deps: Deps) {
  const memo = memoOf(s);
  const seed = seedOf(key);
  let lastWhy = '';
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    try {
      const work = await provider.pick(kind, seed, attempt, { net: deps.net, memo, now: ctx.now, ...(ctx.signal ? { signal: ctx.signal } : {}), ...(ctx.log ? { log: ctx.log } : {}) });
      const why = unsuitable(work.aspect);
      if (why) throw new Unsuitable(`${provider.id} ${work.id}: ${why}`);
      const img = await downloadImage(provider, work, ctx.px, ctx, deps);
      return { work, ...img };
    } catch (err) {
      if (!(err instanceof Unsuitable)) throw err;
      lastWhy = err.message;
      ctx.log?.(`skipped: ${err.message}`);
    }
  }
  throw new Error(`${provider.id}: no suitable work in ${MAX_TRIES} tries (last: ${lastWhy})`);
}

const toData = (s: State, store: Store, stale: boolean): ArtData => ({ key: s.key!, work: s.work!, file: s.file ? store.path(s.file) : null, px: s.px, fetchedAt: s.fetchedAt, stale });

/** One read of the source: from disk, from the network when the key changed or a bigger image is needed. */
export async function readToday(provider: ArtProvider, kind: Kind, date: string, slot: number, ctx: TodayCtx, deps: Deps): Promise<ArtData> {
  const { store } = deps;
  const key = workKey(provider.id, kind, date, slot);
  const s: State = (await store.load()) ?? emptyState();
  const have = !!(s.work && s.file && (await store.exists(s.file)));

  if (have && s.key === key) {
    // A bigger panel than the image kept: one more download, of the image alone, if the museum has it bigger.
    const better = imageUrls(s.work!.image, ctx.px)[0];
    if (better && ctx.px > s.px * 1.15 && better.px > s.px * 1.15 && ctx.now >= s.retryAt) {
      try {
        const img = await downloadImage(provider, s.work!, ctx.px, ctx, deps);
        if (img.px > s.px) {
          const name = `work-${hash32(`${key}|${img.url}`).toString(16)}.${extOf(img.buf)}`;
          await store.writeImage(name, img.buf);
          const next: State = { ...s, file: name, px: img.px };
          await store.save(next);
          await store.prune([name, s.file!]);
          return toData(next, store, false);
        }
      } catch (err) {
        ctx.log?.(`bigger image: ${message(err)}`);
        await store.save({ ...s, retryAt: ctx.now + backoffMs(1) });
      }
    }
    return toData(s, store, false);
  }

  // Asked recently and failed: wait, showing what there is.
  if (s.tryKey === key && ctx.now < s.retryAt) {
    if (have) return toData(s, store, true);
    throw new Error(`${provider.id}: failed, trying again at ${new Date(s.retryAt).toISOString()}`);
  }

  try {
    const got = await fetchWork(provider, kind, key, s, ctx, deps);
    const name = `work-${hash32(`${key}|${got.url}`).toString(16)}.${extOf(got.buf)}`;
    await store.writeImage(name, got.buf);
    const next: State = { ...s, key, work: got.work, file: name, px: got.px, fetchedAt: ctx.now, tryKey: key, attemptAt: ctx.now, failures: 0, retryAt: 0 };
    await store.save(next);
    // The last work's image stays a little, in case a widget is still loading it.
    await store.prune([name, ...(have && s.file ? [s.file] : [])]);
    ctx.log?.(`${key}: ${typeof got.work.title === 'string' ? got.work.title : Object.values(got.work.title)[0]} (${got.px} px)`);
    return toData(next, store, false);
  } catch (err) {
    const failures = s.tryKey === key ? s.failures + 1 : 1;
    const retryAt = Math.max(ctx.now + backoffMs(failures), err instanceof HttpError && err.retryAt ? err.retryAt : 0);
    ctx.log?.(`${key}: ${message(err)}; again at ${new Date(retryAt).toISOString()}`);
    const next: State = { ...s, tryKey: key, attemptAt: ctx.now, failures, retryAt };
    try {
      await store.save(next);
    } catch (e) {
      ctx.log?.(`could not keep the record: ${message(e)}`);
    }
    if (have) return toData(next, store, true);
    throw err;
  }
}
