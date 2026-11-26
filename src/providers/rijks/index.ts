/**
 * The Rijksmuseum (Amsterdam): its new data services (2024-), no key. The
 * old `www.rijksmuseum.nl/api` that needed one answers 410 Gone. Images under
 * the Public Domain Mark or CC0 are free to use; only those are shown, with
 * "Rijksmuseum" as their policy kindly asks.
 *
 * Its search pages with an opaque token, 100 at a time, so a pick narrows it
 * first: a decade (or, for prints, a year) chosen for the day, then one of
 * that period's first page of results, then its record (EDM) and the size of
 * its IIIF image.
 */
import { pickIndex } from '../../pick.ts';
import type { Kind } from '../../types.ts';
import { Unsuitable, type ArtProvider } from '../provider.ts';
import { parseIiifInfo, parseRijksEdm, parseRijksSearch } from './parse.ts';

export const RIJKS_SEARCH = 'https://data.rijksmuseum.nl/search/collection';
export const RIJKS_TYPES: Record<Kind, string> = { painting: 'painting', photograph: 'photograph', print: 'print' };

const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
/**
 * The periods a pick chooses from, as `creationDate` patterns: decades for
 * paintings and photographs (`165?`), single years for prints, which come in
 * thousands a decade.
 */
export const RIJKS_PERIODS: Record<Kind, string[]> = {
  painting: range(1400, 1920, 10).map((y) => `${String(y).slice(0, 3)}?`),
  photograph: range(1840, 1930, 10).map((y) => `${String(y).slice(0, 3)}?`),
  print: range(1470, 1900, 1).map(String),
};

export function rijksSearchUrl(kind: Kind, period: string): string {
  const q = new URLSearchParams({ type: RIJKS_TYPES[kind], imageAvailable: 'true', creationDate: period });
  return `${RIJKS_SEARCH}?${q}`;
}

/** The record in the EDM profile, as JSON-LD (`https://id.rijksmuseum.nl/200100988` → its data URL). */
export const rijksRecordUrl = (pid: string): string => `${pid.replace('://id.rijksmuseum.nl/', '://data.rijksmuseum.nl/')}?_profile=edm-framed&_mediatype=application/ld%2Bjson`;

export const rijks: ArtProvider = {
  id: 'rijks',
  name: { en: 'Rijksmuseum (Amsterdam)', es: 'Rijksmuseum (Ámsterdam)', de: 'Rijksmuseum (Amsterdam)', 'zh-Hans': '荷兰国家博物馆（阿姆斯特丹）', 'zh-Hant': '荷蘭國家博物館（阿姆斯特丹）' },
  hosts: ['data.rijksmuseum.nl', 'iiif.micr.io'],
  kinds: ['painting', 'photograph', 'print'],
  async pick(kind, seed, attempt, ctx) {
    const req = ctx.signal ? { signal: ctx.signal } : {};
    const periods = RIJKS_PERIODS[kind];
    const period = periods[pickIndex(seed, periods.length, attempt)]!;
    const { ids } = parseRijksSearch(await ctx.net.json(rijksSearchUrl(kind, period), req));
    if (!ids.length) throw new Unsuitable(`rijks: no ${kind}s from ${period}`);
    const pid = ids[pickIndex(`${seed}|${period}`, ids.length, attempt)]!;
    const { service, ...work } = parseRijksEdm(await ctx.net.json(rijksRecordUrl(pid), req));
    const size = parseIiifInfo(await ctx.net.json(`${service}/info.json`, req));
    return { ...work, image: { type: 'iiif', base: service, ...size }, aspect: size.width / size.height };
  },
};
