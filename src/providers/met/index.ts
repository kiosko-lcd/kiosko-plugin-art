/**
 * The Metropolitan Museum of Art (New York): its Collection API, no key.
 * Open Access data is CC0 and the images of public-domain works are free to
 * use; only those (`isPublicDomain`) are shown. The old `/v1/search` was
 * retired on 2026-10-01; `/v1.1/search` pages with `offset` and `limit`, so
 * a pick is two small searches (how many, then the n-th) and the object.
 */
import { remembered, Unsuitable, type ArtProvider } from '../provider.ts';
import { pickIndex } from '../../pick.ts';
import type { Kind } from '../../types.ts';
import { parseMetObject, parseMetSearch } from './parse.ts';

export const MET_API = 'https://collectionapi.metmuseum.org/public/collection';

/** The search for each kind: the European Paintings department, the Photographs one, prints from Drawings and Prints. */
export const MET_QUERIES: Record<Kind, string> = {
  painting: 'departmentId=11&hasImages=true&isPublicDomain=true&q=*',
  photograph: 'departmentId=19&hasImages=true&isPublicDomain=true&q=*',
  print: 'departmentId=9&medium=Prints&hasImages=true&isPublicDomain=true&q=*',
};

export const metSearchUrl = (kind: Kind, offset: number, limit = 1): string => `${MET_API}/v1.1/search?${MET_QUERIES[kind]}&offset=${offset}&limit=${limit}`;
export const metObjectUrl = (id: number | string): string => `${MET_API}/v1/objects/${id}`;

export const met: ArtProvider = {
  id: 'met',
  name: { en: 'The Met (New York)', es: 'The Met (Nueva York)', de: 'The Met (New York)', 'zh-Hans': '大都会艺术博物馆（纽约）', 'zh-Hant': '大都會藝術博物館（紐約）' },
  hosts: ['collectionapi.metmuseum.org', 'images.metmuseum.org'],
  kinds: ['painting', 'photograph', 'print'],
  async pick(kind, seed, attempt, ctx) {
    const req = ctx.signal ? { signal: ctx.signal } : {};
    const total = await remembered(ctx.memo, `met:${kind}`, ctx.now, async () => parseMetSearch(await ctx.net.json(metSearchUrl(kind, 0), req)).total);
    if (!total) throw new Error(`met: no ${kind}s found`);
    const n = pickIndex(seed, total, attempt);
    const { ids } = parseMetSearch(await ctx.net.json(metSearchUrl(kind, n), req));
    if (!ids[0]) {
      // Fewer works than remembered: count again next time.
      ctx.memo.set(`met:${kind}`, undefined);
      throw new Unsuitable(`met: nothing at ${n} of ${total}`);
    }
    return parseMetObject(await ctx.net.json(metObjectUrl(ids[0]), req));
  },
};
