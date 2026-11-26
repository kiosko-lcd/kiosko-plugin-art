/** The Met's Collection API answers, as plain values. */
import { str, Unsuitable } from '../provider.ts';
import type { Work } from '../../types.ts';

/** `/public/collection/v1.1/search`: how many, and the ids of this page. */
export function parseMetSearch(data: unknown): { total: number; ids: number[] } {
  const d = (data ?? {}) as { total?: unknown; objectIDs?: unknown };
  const total = typeof d.total === 'number' && d.total > 0 ? d.total : 0;
  const ids = Array.isArray(d.objectIDs) ? d.objectIDs.filter((x): x is number => typeof x === 'number') : [];
  return { total, ids };
}

/** Width / height of the work from its measurements (the "Overall" or first 2-D one), if given. */
function aspectOf(o: Record<string, unknown>): number | undefined {
  const ms = Array.isArray(o.measurements) ? (o.measurements as { elementName?: string; elementMeasurements?: Record<string, number> }[]) : [];
  const pick = ms.find((m) => m.elementName === 'Overall' && m.elementMeasurements?.Width && m.elementMeasurements?.Height) ?? ms.find((m) => m.elementMeasurements?.Width && m.elementMeasurements?.Height && m.elementName !== 'Framed');
  const e = pick?.elementMeasurements;
  return e?.Width && e?.Height ? e.Width / e.Height : undefined;
}

export const MET_MUSEUM = 'The Met';
/** The original's long edge isn't given: a number past any panel (and that survives JSON, unlike Infinity). */
export const ORIGINAL_PX = 100_000;

/**
 * `/public/collection/v1/objects/{id}`: the work, if it is in the public
 * domain and has an image (only those have one under Open Access).
 */
export function parseMetObject(data: unknown): Work {
  const o = (data ?? {}) as Record<string, unknown>;
  const id = str(o.objectID);
  if (!id) throw new Unsuitable('not an object');
  if (o.isPublicDomain !== true) throw new Unsuitable(`met ${id}: not in the public domain`);
  const small = str(o.primaryImageSmall);
  const large = str(o.primaryImage);
  if (!small && !large) throw new Unsuitable(`met ${id}: no image`);
  const prefix = str(o.artistPrefix);
  const name = str(o.artistDisplayName);
  const artist = name ? (prefix ? `${prefix} ${name}` : name) : str(o.culture);
  const aspect = aspectOf(o);
  return {
    provider: 'met',
    id,
    title: str(o.title) || str(o.objectName),
    artist,
    date: str(o.objectDate),
    museum: MET_MUSEUM,
    license: 'public-domain',
    url: str(o.objectURL) || `https://www.metmuseum.org/art/collection/search/${id}`,
    // "web-large" is about 600 px on its long edge; the original, several thousand.
    image: { type: 'urls', urls: [...(small ? [{ px: 600, url: small }] : []), ...(large ? [{ px: ORIGINAL_PX, url: large }] : [])] },
    ...(aspect ? { aspect } : {}),
  };
}
