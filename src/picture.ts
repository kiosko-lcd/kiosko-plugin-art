/**
 * Today's image, decoded and analysed once for every tile and the
 * interlude: shrunk in another thread (Kiosko 0.2.5 and later) to at most
 * the size the source downloaded, so a paint is a plain `drawImage`.
 */
import { readFile } from 'node:fs/promises';
import type { Canvas, CanvasApi, Image } from '@kiosko/sdk';
import { analyse, chartEdges, workBlock, type Look } from './look.ts';
import type { ArtData, Work } from './types.ts';

export interface Picture {
  key: string;
  work: Work;
  stale: boolean;
  img: Image | Canvas;
  w: number;
  h: number;
  look: Look;
}

/** Long edge of the thumbnail the look is read from. */
export const THUMB = 96;
/** Largest decoded size (a 2048 px image is 16 MB in memory; the panels never need more). */
export const DECODE = 2048;

function thumbnail(canvas: Pick<CanvasApi, 'createCanvas'>, img: Image | Canvas, w: number, h: number, long = THUMB) {
  const s = long / Math.max(w, h);
  const tw = Math.max(1, Math.round(w * s)), th = Math.max(1, Math.round(h * s));
  const g = canvas.createCanvas(tw, th).getContext('2d');
  g.drawImage(img, 0, 0, tw, th);
  return { data: g.getImageData(0, 0, tw, th).data, tw, th };
}

/** The look of an image (or canvas), from a thumbnail drawn on `canvas`. */
export function lookOf(canvas: Pick<CanvasApi, 'createCanvas'>, img: Image | Canvas, w: number, h: number): Look {
  const { data, tw, th } = thumbnail(canvas, img, w, h);
  return analyse(data, tw, th);
}

/**
 * The part of a museum photograph that is the work, without the colour
 * chart, rulers and labels photographed with it, in its pixels: first the
 * work's own block on the backdrop (see `workBlock`), then a chart still
 * along one of its edges (see `chartEdges`). The whole image if there are
 * none.
 */
export function chartCrop(canvas: Pick<CanvasApi, 'createCanvas'>, img: Image | Canvas, w: number, h: number): { x: number; y: number; w: number; h: number } {
  let r = { x: 0, y: 0, w, h };
  const t1 = thumbnail(canvas, img, w, h, 240);
  const block = workBlock(t1.data, t1.tw, t1.th);
  if (block) {
    const x0 = Math.round(block.x0 * w), y0 = Math.round(block.y0 * h);
    r = { x: x0, y: y0, w: Math.round(block.x1 * w) - x0, h: Math.round(block.y1 * h) - y0 };
  }
  const c = canvas.createCanvas(r.w, r.h);
  c.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  const t2 = thumbnail(canvas, c, r.w, r.h, 160);
  const e = chartEdges(t2.data, t2.tw, t2.th);
  const x0 = Math.round(e.left * r.w), y0 = Math.round(e.top * r.h);
  return { x: r.x + x0, y: r.y + y0, w: Math.round((1 - e.right) * r.w) - x0, h: Math.round((1 - e.bottom) * r.h) - y0 };
}

/** The image cut to `chartCrop` (a copy; the same image if nothing is cut). */
export function withoutChart(canvas: Pick<CanvasApi, 'createCanvas'>, img: Image | Canvas, w: number, h: number): { img: Image | Canvas; w: number; h: number } {
  const r = chartCrop(canvas, img, w, h);
  if (r.x === 0 && r.y === 0 && r.w === w && r.h === h) return { img, w, h };
  const c = canvas.createCanvas(r.w, r.h);
  c.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return { img: c, w: r.w, h: r.h };
}

const loaded = new Map<string, Promise<Picture>>();

/** Decodes and analyses `art`'s image; the same promise for every caller while it's today's. */
export function loadPicture(canvas: CanvasApi, art: ArtData): Promise<Picture> {
  const file = art.file;
  if (!file) return Promise.reject(new Error('no image'));
  const hit = loaded.get(file);
  if (hit) return hit.then((p) => ({ ...p, key: art.key, work: art.work, stale: art.stale }));
  const p = (async (): Promise<Picture> => {
    const decoded = canvas.loadImageScaled ? await canvas.loadImageScaled(file, { width: DECODE, height: DECODE, fit: 'contain' }) : await canvas.loadImage(await readFile(file));
    const { img, w, h } = art.work.chart ? withoutChart(canvas, decoded, decoded.width, decoded.height) : { img: decoded as Image | Canvas, w: decoded.width, h: decoded.height };
    return { key: art.key, work: art.work, stale: art.stale, img, w, h, look: lookOf(canvas, img, w, h) };
  })();
  loaded.set(file, p);
  p.catch(() => loaded.delete(file));
  // Only the latest two (today's, and yesterday's while it is replaced).
  while (loaded.size > 2) loaded.delete(loaded.keys().next().value!);
  return p;
}
