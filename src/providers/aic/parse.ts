/** The Art Institute of Chicago's API answers, as plain values. */
import { str, Unsuitable } from '../provider.ts';
import type { Work } from '../../types.ts';

export const AIC_IIIF = 'https://www.artic.edu/iiif/2';
/**
 * The widths its IIIF server gives: 843 is the one it asks to prefer, and
 * public-domain works may also be asked for at 1200 and 1686.
 */
export const AIC_WIDTHS = [200, 400, 600, 843, 1200, 1686];
export const AIC_MUSEUM = 'Art Institute of Chicago';

export interface AicPage {
  total: number;
  items: Record<string, unknown>[];
}

export function parseAicSearch(data: unknown): AicPage {
  const d = (data ?? {}) as { pagination?: { total?: unknown }; data?: unknown; status?: unknown; detail?: unknown };
  if (typeof d.status === 'number' && d.status >= 400) throw new Error(`aic: ${str(d.detail) || `status ${d.status}`}`);
  const total = typeof d.pagination?.total === 'number' ? d.pagination.total : 0;
  return { total, items: Array.isArray(d.data) ? (d.data as Record<string, unknown>[]) : [] };
}

/**
 * Why an artwork isn't a picture to show, or null: a box (classified so,
 * paintings and prints alike), an album as a whole (classified as one, not as
 * a leaf: its image is often its cover), and, among paintings and
 * photographs, an album's or book's cover or binding by its title. A print
 * made as a cover (Bonnard's "Album Cover for Landscapes and Interiors") is a
 * print, and stays.
 */
export function aicNotAPicture(o: Record<string, unknown>): string | null {
  const classes = Array.isArray(o.classification_titles) ? o.classification_titles.map((c) => str(c).toLowerCase()) : [];
  if (classes.includes('box')) return 'a box';
  if (classes.includes('album/sketchbook') && !classes.includes('album leaf')) return 'an album as a whole';
  if (str(o.artwork_type_title) !== 'Print' && /\b(album|book|portfolio) cover\b|\bbinding\b/i.test(str(o.title))) return 'a cover or binding';
  return null;
}

/** One artwork of a search with the fields asked for (see `AIC_FIELDS`). */
export function parseAicArtwork(o: Record<string, unknown>): Work {
  const id = str(o.id);
  if (!id) throw new Unsuitable('aic: not an artwork');
  if (o.is_public_domain !== true) throw new Unsuitable(`aic ${id}: not in the public domain`);
  const image = str(o.image_id);
  if (!image) throw new Unsuitable(`aic ${id}: no image`);
  const not = aicNotAPicture(o);
  if (not) throw new Unsuitable(`aic ${id}: ${not}`);
  const thumb = (o.thumbnail ?? {}) as { width?: unknown; height?: unknown };
  const W = typeof thumb.width === 'number' ? thumb.width : 0;
  const H = typeof thumb.height === 'number' ? thumb.height : 0;
  // `artist_title` is the name alone; `artist_display` adds nationality and dates on a second line.
  const artist = str(o.artist_title) || str(o.artist_display).split('\n')[0]!.trim();
  return {
    provider: 'aic',
    id,
    title: str(o.title),
    artist,
    date: str(o.date_display),
    museum: AIC_MUSEUM,
    license: 'cc0',
    url: `https://www.artic.edu/artworks/${id}`,
    image: { type: 'iiif', base: `${AIC_IIIF}/${image}`, width: W, height: H, widths: AIC_WIDTHS },
    ...(W && H ? { aspect: W / H } : {}),
  };
}
