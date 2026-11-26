/**
 * Images without decoding them: their size from the file's header, which
 * URL to ask for to get the size the panels need (no bigger), and whether a
 * work's shape suits a panel at all.
 */
import type { ImageRef } from './types.ts';

/** Width and height of a JPEG, PNG, GIF or WebP from its first bytes; null if it is none of those. */
export function imageDims(b: Uint8Array): { w: number; h: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // PNG: the IHDR chunk comes first.
  if (b.length >= 24 && v.getUint32(0) === 0x89504e47) return { w: v.getUint32(16), h: v.getUint32(20) };
  // GIF
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { w: v.getUint16(6, true), h: v.getUint16(8, true) };
  // WebP (lossy VP8 and lossless VP8L).
  if (b.length >= 30 && v.getUint32(0) === 0x52494646 && v.getUint32(8) === 0x57454250) {
    const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (chunk === 'VP8 ') return { w: v.getUint16(26, true) & 0x3fff, h: v.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8X') return { w: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), h: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)) };
    if (chunk === 'VP8L') {
      const bits = v.getUint32(21, true);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  // JPEG: walk the segments to the frame header (SOF0-SOF15, but not DHT, JPG, DAC).
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1]!;
      if (m === 0xff) {
        i++;
        continue;
      }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = v.getUint16(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: v.getUint16(i + 5), w: v.getUint16(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/** Long edges the plugin asks for: a few steps, so a slightly bigger panel doesn't mean a new download. */
export const PX_STEPS = [480, 843, 1200, 1686, 2048];
export const DEFAULT_PX = 843;

/** The step at or above `px`. */
export function stepFor(px: number): number {
  return PX_STEPS.find((s) => s >= px) ?? PX_STEPS[PX_STEPS.length - 1]!;
}

/**
 * URLs to ask for an image whose long edge is about `px`, best first, then
 * fallbacks (a smaller size, if the first is refused or too big).
 */
export function imageUrls(ref: ImageRef, px: number): { url: string; px: number }[] {
  if (ref.type === 'urls') {
    const sorted = [...ref.urls].sort((a, b) => a.px - b.px);
    const first = sorted.find((u) => u.px >= px) ?? sorted[sorted.length - 1];
    if (!first) return [];
    return [first, ...sorted.filter((u) => u !== first && u.px < first.px).reverse()];
  }
  const { width: W, height: H } = ref;
  if (!(W > 0 && H > 0)) return [{ url: `${ref.base}/full/843,/0/default.jpg`, px: 843 }];
  // The width that makes the long edge `px`, never more than the full size or the area allowed.
  let w = Math.min(W, Math.round((px * W) / Math.max(W, H)));
  if (ref.maxArea) w = Math.min(w, Math.floor(Math.sqrt((ref.maxArea * W) / H)));
  const widths = ref.widths ? [...ref.widths].sort((a, b) => a - b) : null;
  if (widths) w = widths.find((x) => x >= w) ?? widths[widths.length - 1]!;
  w = Math.max(1, w);
  const long = (x: number) => Math.round((x * Math.max(W, H)) / W);
  const out = [{ url: `${ref.base}/full/${w},/0/default.jpg`, px: long(w) }];
  const fallback = widths ? ([...widths].reverse().find((x) => x < w) ?? null) : w > 843 ? 843 : null;
  if (fallback) out.push({ url: `${ref.base}/full/${fallback},/0/default.jpg`, px: long(fallback) });
  return out;
}

/** Longest side over shortest past which a work is too long or too tall for any panel shape. */
export const MAX_ASPECT = 3.2;
/** A long edge under this would be a blur on a panel. */
export const MIN_LONG_PX = 300;

/** Why a work of this shape (and, if known, size) doesn't suit; null if it does. */
export function unsuitable(aspect: number | undefined, size?: { w: number; h: number }): string | null {
  if (aspect !== undefined && Number.isFinite(aspect) && aspect > 0) {
    const r = Math.max(aspect, 1 / aspect);
    if (r > MAX_ASPECT) return `too ${aspect > 1 ? 'long' : 'tall'} (${aspect.toFixed(2)})`;
  }
  if (size && Math.max(size.w, size.h) < MIN_LONG_PX) return `too small (${size.w}×${size.h})`;
  return null;
}
