/**
 * The Art Institute of Chicago: its public API and IIIF image server, no
 * key. Its data is CC0 (but `description`, which isn't used) and the images
 * of public-domain works are CC0 too; only those (`is_public_domain`) are
 * asked for. It asks for an `AIC-User-Agent` header naming the project, and
 * for images at the 843 px width (up to 1686 for public-domain works) to hit
 * its cache: the plugin asks for the smallest of those the panels need.
 *
 * Its search can't go past the 1,000th result. Sorted by id, a pick in the
 * first thousand is asked for from the start, one in the last thousand from
 * the end, and one in between as the first work with an id past a point
 * picked between the lowest and the highest.
 */
import { AGENT } from '../../net.ts';
import { pickIndex } from '../../pick.ts';
import type { Kind } from '../../types.ts';
import { remembered, Unsuitable, type ArtProvider } from '../provider.ts';
import { parseAicArtwork, parseAicSearch } from './parse.ts';

export const AIC_SEARCH = 'https://api.artic.edu/api/v1/artworks/search';
/** Its "artwork type" ids: Painting, Photograph, Print. */
export const AIC_TYPES: Record<Kind, number> = { painting: 1, photograph: 2, print: 18 };
export const AIC_FIELDS = ['id', 'title', 'artist_display', 'artist_title', 'date_display', 'image_id', 'is_public_domain', 'thumbnail', 'artwork_type_title'];
/** The furthest its search pages. */
export const AIC_WINDOW = 1000;
/** Who is asking, as its docs request (the project and a way to reach it). */
export const AIC_USER_AGENT = `${AGENT} (+https://kioskolcd.dev; info@kioskolcd.dev)`;

const filter = (kind: Kind, extra: unknown[] = []) => ({
  bool: { filter: [{ term: { is_public_domain: true } }, { term: { artwork_type_id: AIC_TYPES[kind] } }, { exists: { field: 'image_id' } }, ...extra] },
});

/** The body of one search: `limit` works from `from`, sorted by id. */
export function aicQuery(kind: Kind, o: { from?: number; order?: 'asc' | 'desc'; minId?: number; fields?: string[] } = {}): string {
  return JSON.stringify({
    fields: o.fields ?? ['id'],
    limit: 1,
    ...(o.from ? { from: o.from } : {}),
    sort: [{ id: o.order ?? 'asc' }],
    query: filter(kind, o.minId !== undefined ? [{ range: { id: { gte: o.minId } } }] : []),
  });
}

/** Where to look for the n-th of `total` works sorted by id. */
export function aicPlan(n: number, total: number, minId: number, maxId: number): { from: number; order: 'asc' | 'desc'; minId?: number } {
  if (n < AIC_WINDOW) return { from: n, order: 'asc' };
  if (total - 1 - n < AIC_WINDOW) return { from: total - 1 - n, order: 'desc' };
  return { from: 0, order: 'asc', minId: Math.floor(minId + ((maxId - minId) * n) / total) };
}

const HEADERS = { 'AIC-User-Agent': AIC_USER_AGENT, 'Content-Type': 'application/json' };

export const aic: ArtProvider = {
  id: 'aic',
  name: { en: 'Art Institute of Chicago', es: 'Art Institute of Chicago', de: 'Art Institute of Chicago', 'zh-Hans': '芝加哥艺术博物馆', 'zh-Hant': '芝加哥藝術博物館' },
  hosts: ['api.artic.edu', 'www.artic.edu'],
  kinds: ['painting', 'photograph', 'print'],
  imageHeaders: { 'AIC-User-Agent': AIC_USER_AGENT },
  async pick(kind, seed, attempt, ctx) {
    const ask = async (body: string) => parseAicSearch(await ctx.net.json(AIC_SEARCH, { method: 'POST', body, headers: HEADERS, ...(ctx.signal ? { signal: ctx.signal } : {}) }));
    const span = await remembered(ctx.memo, `aic:${kind}`, ctx.now, async () => {
      const first = await ask(aicQuery(kind));
      const last = first.total > AIC_WINDOW * 2 ? await ask(aicQuery(kind, { order: 'desc' })) : first;
      return { total: first.total, minId: Number(first.items[0]?.id ?? 0), maxId: Number(last.items[0]?.id ?? 0) };
    });
    if (!span.total) throw new Error(`aic: no ${kind}s found`);
    const n = pickIndex(seed, span.total, attempt);
    const page = await ask(aicQuery(kind, { ...aicPlan(n, span.total, span.minId, span.maxId), fields: AIC_FIELDS }));
    const item = page.items[0];
    if (!item) {
      ctx.memo.set(`aic:${kind}`, undefined);
      throw new Unsuitable(`aic: nothing at ${n} of ${span.total}`);
    }
    return parseAicArtwork(item);
  },
};
