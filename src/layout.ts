/**
 * Fitting a work to a tile: whole (letterboxed) when that fills enough of
 * it, else cropped to the most interesting part (a long strip shows the best
 * band of a painting); and where the caption goes: a panel beside or under
 * the work when the tile's shape leaves room, over its bottom edge when not.
 */
import type { Box } from '@kiosko/sdk';
import { bestWindow, type Look } from './look.ts';

export type Fit = 'auto' | 'whole' | 'fill';
export type CaptionMode = 'auto' | 'panel' | 'overlay';

export interface Placement {
  mode: 'contain' | 'cover';
  /** The part of the image shown, in its pixels. */
  src: Box;
  /** Where it is painted. */
  dst: Box;
}

/** Whole when it covers at least this much of the area; cropped otherwise. */
export const MIN_FILL = 0.55;

/** How an image of `iw`×`ih` goes in `area`. */
export function placeWork(iw: number, ih: number, area: Box, look: Pick<Look, 'rows' | 'cols'>, fit: Fit = 'auto'): Placement {
  const sc = Math.min(area.w / iw, area.h / ih);
  const fill = (iw * sc * ih * sc) / Math.max(1, area.w * area.h);
  if (fit === 'whole' || (fit === 'auto' && fill >= MIN_FILL)) {
    const w = iw * sc, h = ih * sc;
    return { mode: 'contain', src: { x: 0, y: 0, w: iw, h: ih }, dst: { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h } };
  }
  const s = Math.max(area.w / iw, area.h / ih);
  const sw = Math.min(iw, area.w / s), sh = Math.min(ih, area.h / s);
  let sx = (iw - sw) / 2, sy = (ih - sh) / 2;
  if (sh < ih - 0.5) sy = bestWindow(look.rows, sh / ih) * ih;
  if (sw < iw - 0.5) sx = bestWindow(look.cols, sw / iw) * iw;
  return { mode: 'cover', src: { x: sx, y: sy, w: sw, h: sh }, dst: { ...area } };
}

export interface Frame {
  place: Placement;
  /** Where the caption's text goes; on a panel of the work's background, or over the work (`overlay`). */
  caption: Box;
  overlay: boolean;
}

/** Narrowest side panel worth having. */
export const MIN_SIDE = 140;

/**
 * The tile's layout for an image of `iw`×`ih`. `lineH` is a caption line's
 * height at the tile's text size; `lines`, how many a panel should hold.
 */
export function frameFor(box: Box, iw: number, ih: number, look: Pick<Look, 'rows' | 'cols'>, o: { lineH: number; lines: number; fit?: Fit; caption?: CaptionMode }): Frame {
  const fit = o.fit ?? 'auto';
  const mode = o.caption ?? 'auto';
  const pad = Math.round(o.lineH * 0.5);
  const panelH = Math.ceil(o.lineH * o.lines + pad * 2);
  const overlayOf = (place: Placement): Frame => {
    const lines = Math.max(1, Math.min(o.lines, Math.floor((box.h - pad) / o.lineH)));
    const h = Math.min(box.h, Math.ceil(lines * o.lineH + pad * (box.h > o.lineH * 2 ? 1.4 : 0.4)));
    return { place, caption: { x: box.x, y: box.y + box.h - h, w: box.w, h }, overlay: true };
  };
  if (mode !== 'overlay') {
    // A long strip: the caption at the right, the work in the rest.
    if (box.w >= box.h * 2.2 && box.w >= 300) {
      const one = box.h < o.lineH * 2.2;
      const cw = Math.round(Math.max(MIN_SIDE, Math.min(one ? 460 : 380, box.w * (one ? 0.45 : 0.3))));
      const area = { x: box.x, y: box.y, w: box.w - cw, h: box.h };
      return { place: placeWork(iw, ih, area, look, fit), caption: { x: box.x + box.w - cw + pad, y: box.y, w: cw - pad * 2, h: box.h }, overlay: false };
    }
    // A tall tile: the caption under the work.
    if (box.h >= box.w * 1.3 && box.h >= 200 && box.h - panelH >= box.h * 0.45) {
      const area = { x: box.x, y: box.y, w: box.w, h: box.h - panelH };
      const place = placeWork(iw, ih, area, look, fit);
      if (place.mode === 'contain') {
        // The work and its caption together, in the middle.
        const top = box.y + (box.h - place.dst.h - panelH) / 2;
        return { place: { ...place, dst: { ...place.dst, y: top } }, caption: { x: box.x + pad, y: top + place.dst.h, w: box.w - pad * 2, h: panelH }, overlay: false };
      }
      return { place, caption: { x: box.x + pad, y: box.y + box.h - panelH, w: box.w - pad * 2, h: panelH }, overlay: false };
    }
    // Squarish: whole, and the caption in the room it leaves, if enough.
    // Whole when the room it leaves holds the caption (unless asked to fill).
    const whole = placeWork(iw, ih, box, look, fit === 'fill' ? 'fill' : 'whole');
    if (whole.mode === 'contain') {
      const spareH = box.h - whole.dst.h;
      const spareW = box.w - whole.dst.w;
      const minPanel = o.lineH * 2 + pad * 2;
      if (spareH >= minPanel) {
        const ch = Math.min(spareH, panelH);
        // The work and its caption, together, centred.
        const top = box.y + (box.h - whole.dst.h - ch) / 2;
        return { place: { ...whole, dst: { ...whole.dst, y: top } }, caption: { x: box.x + pad, y: top + whole.dst.h, w: box.w - pad * 2, h: ch }, overlay: false };
      }
      if (spareW >= MIN_SIDE) {
        const cw = Math.min(spareW, 360);
        const left = box.x + (box.w - whole.dst.w - cw) / 2;
        return { place: { ...whole, dst: { ...whole.dst, x: left } }, caption: { x: left + whole.dst.w + pad, y: box.y, w: cw - pad * 2, h: box.h }, overlay: false };
      }
    }
    // Asked for a panel and none fits beside: make room under the work.
    if (mode === 'panel' && box.h >= panelH * 2.5) {
      const area = { x: box.x, y: box.y, w: box.w, h: box.h - panelH };
      return { place: placeWork(iw, ih, area, look, fit), caption: { x: box.x + pad, y: box.y + box.h - panelH, w: box.w - pad * 2, h: panelH }, overlay: false };
    }
    return overlayOf(placeWork(iw, ih, box, look, fit));
  }
  return overlayOf(placeWork(iw, ih, box, look, fit));
}
