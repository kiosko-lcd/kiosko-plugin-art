/** The Rijksmuseum's data services answers (Linked Art search, EDM records, IIIF), as plain values. */
import { str, Unsuitable } from '../provider.ts';
import type { License, Work } from '../../types.ts';

export const RIJKS_MUSEUM = 'Rijksmuseum';
/** The rights an image may have to be shown: the Public Domain Mark and CC0. */
export const RIJKS_OPEN: Record<string, License> = {
  'http://creativecommons.org/publicdomain/mark/1.0/': 'public-domain',
  'https://creativecommons.org/publicdomain/mark/1.0/': 'public-domain',
  'http://creativecommons.org/publicdomain/zero/1.0/': 'cc0',
  'https://creativecommons.org/publicdomain/zero/1.0/': 'cc0',
};

/** `/search/collection`: how many there are and this page's object ids (`https://id.rijksmuseum.nl/…`). */
export function parseRijksSearch(data: unknown): { total: number; ids: string[] } {
  const d = (data ?? {}) as { partOf?: { totalItems?: unknown }; orderedItems?: unknown };
  const total = typeof d.partOf?.totalItems === 'number' ? d.partOf.totalItems : 0;
  const ids = Array.isArray(d.orderedItems) ? d.orderedItems.map((x) => str((x as { id?: unknown })?.id)).filter(Boolean) : [];
  return { total, ids };
}

type Lang = { '@language'?: string; '@value'?: string };

/** The English value of a language-tagged list, else the Dutch one, else any. */
export function langValue(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) {
    const vs = v as Lang[];
    return str((vs.find((x) => x['@language'] === 'en') ?? vs.find((x) => x['@language'] === 'nl') ?? vs[0])?.['@value']);
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('@value' in o) return str(o['@value']);
    return str(o.en ?? o.nl ?? Object.values(o)[0]);
  }
  return '';
}

const PREF = 'http://www.w3.org/2004/02/skos/core#prefLabel';

/**
 * Object types (English or Dutch, as its records give them) of what holds,
 * binds or frames pictures rather than being one: frames, boxes, cases,
 * photograph albums and scrapbooks, wrappers and book covers.
 */
const NOT_PICTURES = new Set(['frame', 'lijst', 'box', 'doos', 'etui', 'case', 'cassette', 'photograph album', 'fotoalbum', 'album', 'scrapbook', 'plakboek', 'wrapper', 'omslag', 'book cover', 'boekband', 'binding', 'bookbinding']);

/** The labels of every type of an object, in any language. */
function typeLabels(cho: Record<string, any>): string[] {
  const types = (Array.isArray(cho.dcType) ? cho.dcType : cho.dcType ? [cho.dcType] : []) as Record<string, unknown>[];
  return types.flatMap((t) => {
    const l = t?.[PREF];
    const ls = (Array.isArray(l) ? l : [l]) as unknown[];
    return ls.map((x) => (typeof x === 'string' ? x : str((x as Lang)?.['@value'])).toLowerCase()).filter(Boolean);
  });
}

/** Why a Rijksmuseum object isn't a picture to show (from its types), or null. */
export function rijksNotAPicture(cho: Record<string, any>): string | null {
  const hit = typeLabels(cho).find((t) => NOT_PICTURES.has(t));
  return hit ? `a ${hit}` : null;
}

/**
 * An object's record in the EDM profile (`?_profile=edm-framed`): the work,
 * if its image is in the public domain or CC0, with its IIIF service (whose
 * size `iiifInfo` reads).
 */
export function parseRijksEdm(data: unknown): Omit<Work, 'image'> & { service: string } {
  const d = (data ?? {}) as Record<string, any>;
  const cho = (d.aggregatedCHO ?? {}) as Record<string, any>;
  const id = str(cho.id).replace(/^https?:\/\/id\.rijksmuseum\.nl\//, '');
  if (!id) throw new Unsuitable('rijks: not an object');
  const license = RIJKS_OPEN[str(d.edmRights)];
  if (!license) throw new Unsuitable(`rijks ${id}: image rights ${str(d.edmRights) || 'unknown'}`);
  const not = rijksNotAPicture(cho);
  if (not) throw new Unsuitable(`rijks ${id}: ${not}`);
  const shown = (d.isShownBy ?? d.object ?? {}) as Record<string, any>;
  const service = str(shown['http://rdfs.org/sioc/services#has_service']?.id);
  if (!service) throw new Unsuitable(`rijks ${id}: no IIIF image`);
  const creators = (Array.isArray(cho.creator) ? cho.creator : cho.creator ? [cho.creator] : []) as Record<string, unknown>[];
  const artist = creators.map((c) => langValue(c[PREF])).filter(Boolean).join(', ');
  const number = Array.isArray(cho.identifier) ? str(cho.identifier[0]) : str(cho.identifier);
  return {
    provider: 'rijks',
    id: number || id,
    title: langValue(cho.title),
    artist,
    date: langValue(cho.created),
    museum: RIJKS_MUSEUM,
    license,
    url: str(d.isShownAt?.id) || str(cho.id),
    service,
  };
}

/** A IIIF `info.json`: the full size. */
export function parseIiifInfo(data: unknown): { width: number; height: number } {
  const d = (data ?? {}) as { width?: unknown; height?: unknown };
  const width = Number(d.width), height = Number(d.height);
  if (!(width > 0 && height > 0)) throw new Error('IIIF info without a size');
  return { width, height };
}
