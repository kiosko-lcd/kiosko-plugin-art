/** What the providers, the source, the widget and the interlude share. Plain data. */

/** What sort of work to show. Each provider maps these to its own departments or types. */
export type Kind = 'painting' | 'photograph' | 'print';
export const KINDS: Kind[] = ['painting', 'photograph', 'print'];

/**
 * A text the museum gives in one language (a string) or in several (by
 * language tag: the National Palace Museum's titles come in Chinese and,
 * sometimes, English). Never translated by the plugin.
 */
export type Text = string | Record<string, string>;

/** How the licence of the image is shown. */
export type License = 'public-domain' | 'cc0' | 'cc-by';

/** Where today's image can be downloaded from, at the sizes the museum offers. */
export type ImageRef =
  | {
      /** A IIIF Image API service: any width up to the full one (or only `widths`), within `maxArea` pixels. */
      type: 'iiif';
      base: string;
      /** Full size (or a size with the same shape), in pixels. */
      width: number;
      height: number;
      /** Only these widths (the Art Institute of Chicago's). */
      widths?: number[];
      /** At most this many pixels (the National Palace Museum's CC0 images are up to a megapixel). */
      maxArea?: number;
    }
  | {
      /** Fixed files, by the length of their long edge (a big number for an original of unknown size). */
      type: 'urls';
      urls: { px: number; url: string }[];
    };

export interface Work {
  /** `met`, `aic`, `rijks`, `npm`. */
  provider: string;
  /** The museum's own id of the object. */
  id: string;
  title: Text;
  /** Empty when the museum gives none (anonymous works, or folded into the title). */
  artist: string;
  /** As the museum writes it: "1874", "ca. 1630", "清 乾隆". */
  date: string;
  /** The museum's name, as shown: "The Met", "Rijksmuseum", "國立故宮博物院". */
  museum: Text;
  license: License;
  /**
   * The credit line the museum's terms ask for, instead of "museum ·
   * licence" (the National Palace Museum's "The National Palace Museum,
   * Taipei, CC BY 4.0 @ www.npm.gov.tw").
   */
  credit?: Text;
  /** The work's page on the museum's site. */
  url: string;
  image: ImageRef;
  /** Width / height, when known before downloading (to skip very long or very tall ones). */
  aspect?: number;
  /** Its images may include a colour chart along an edge, to be cut off (see `chartBands`). */
  chart?: boolean;
}

/** What the source hands to the widget and the interlude. */
export interface ArtData {
  /** Provider, kind, local date and slot: a new key, a new work. */
  key: string;
  work: Work;
  /** The image on disk; null in the demo data. */
  file: string | null;
  /** Long edge of the image downloaded, in pixels. */
  px: number;
  fetchedAt: number;
  /** Today's could not be fetched: this is the last one there was. */
  stale: boolean;
  demo?: boolean;
}
