/**
 * `art/show`: the work of the day full screen for a few seconds, with a slow
 * Ken Burns move (a gentle zoom towards its most interesting part) or, on a
 * long strip where only a band of it fits, a slow scan along it from one end
 * to the other. Its credit stays on screen all along.
 */
import { defineInterlude, t, type Box, type Canvas, type Graphics, type Image } from '@kiosko/sdk';
import * as kit from '@loksly/lcd-canvas-kit';
import { captionOf } from './credit.ts';
import { demoPicture } from './demo.ts';
import { L } from './i18n.ts';
import { placeWork } from './layout.ts';
import { bestWindow, type Look } from './look.ts';
import { loadPicture, type Picture } from './picture.ts';
import { noteBox } from './sizes.ts';
import { SOURCE } from './source-id.ts';
import type { ArtData } from './types.ts';
import { captionLines, sizesFor } from './widget.ts';

export const FPS = 12;
/** How far the Ken Burns zoom goes. */
export const ZOOM = 1.15;
/** Under this share of the work visible across, it is a strip: scan it instead of zooming. */
export const SCAN_BELOW = 0.4;

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The part of the image shown at `t` (0..1) of the move, in its pixels, for a screen of `W`×`H`. */
export function kenBurns(iw: number, ih: number, W: number, H: number, look: Pick<Look, 'rows' | 'cols'>, t: number, motion = true): Box {
  const start = placeWork(iw, ih, { x: 0, y: 0, w: W, h: H }, look, 'fill').src;
  if (!motion) return start;
  const e = ease(Math.max(0, Math.min(1, t)));
  const fx = start.w / iw, fy = start.h / ih;
  // A strip: travel along the cropped side.
  if (fy < SCAN_BELOW) return { ...start, y: lerp(0, ih - start.h, e) };
  if (fx < SCAN_BELOW) return { ...start, x: lerp(0, iw - start.w, e) };
  // A zoom towards the middle of the most interesting part.
  const cx = (bestWindow(look.cols, 0.4) + 0.2) * iw;
  const cy = (bestWindow(look.rows, 0.4) + 0.2) * ih;
  const w = start.w / ZOOM, h = start.h / ZOOM;
  const end = { x: Math.max(0, Math.min(iw - w, cx - w / 2)), y: Math.max(0, Math.min(ih - h, cy - h / 2)), w, h };
  return { x: lerp(start.x, end.x, e), y: lerp(start.y, end.y, e), w: lerp(start.w, end.w, e), h: lerp(start.h, end.h, e) };
}

/** The picture shrunk once to what the move needs, so every frame is a cheap copy. */
function prescaled(canvasApi: { createCanvas: (w: number, h: number) => Canvas }, img: Image | Canvas, iw: number, ih: number, W: number, H: number): { src: Image | Canvas; k: number } {
  const k = Math.min(1, Math.max(W / iw, H / ih) * ZOOM * 1.05);
  if (k > 0.85) return { src: img, k: 1 };
  const c = canvasApi.createCanvas(Math.max(1, Math.round(iw * k)), Math.max(1, Math.round(ih * k)));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return { src: c, k: c.width / iw };
}

export const show = defineInterlude({
  id: 'show',
  name: L('Work of the day, full screen', 'Obra del día, a pantalla completa', 'Werk des Tages, im Vollbild', '每日一作（全屏）', '每日一作（全螢幕）'),
  description: L(
    "Today's work over the whole panel for a few seconds, with a slow zoom towards its most interesting part (on a long strip, a slow scan along it), and its credit on screen.",
    'La obra de hoy en todo el panel unos segundos, con un zoom lento hacia su parte más interesante (en una barra larga, un recorrido lento a lo largo de ella), y su crédito en pantalla.',
    'Das Werk des Tages einige Sekunden auf dem ganzen Panel, mit einem langsamen Zoom zu seinem interessantesten Teil (auf einer langen Leiste ein langsamer Schwenk entlang), und seiner Nennung auf dem Bildschirm.',
    '今天的作品占满整个面板几秒钟，缓慢放大到最有看点的部分（长条上则缓慢平移），并在屏幕上标明出处。',
    '今天的作品占滿整個面板幾秒鐘，緩慢放大到最有看頭的部分（長條上則緩慢平移），並在螢幕上標示出處。',
  ),
  icon: 'image',
  fps: FPS,
  sources: [SOURCE],
  preview: { poster: 'docs/show.jpg' },
  options: t.object({
    seconds: t.integer({ default: 15, min: 5, max: 60, unit: 's', label: L('Seconds', 'Segundos', 'Sekunden', '秒数', '秒數') }),
    motion: t.boolean({
      default: true,
      label: L('Slow zoom or scan', 'Zoom o recorrido lento', 'Langsamer Zoom oder Schwenk', '缓慢缩放或平移', '緩慢縮放或平移'),
      help: L('Off: the work stands still.', 'Desactivado: la obra queda quieta.', 'Aus: Das Werk steht still.', '关闭：作品保持静止。', '關閉：作品保持靜止。'),
    }),
  }),
  async prepare(ctx) {
    const { width: W, height: H } = ctx;
    noteBox(W, H, ctx.now);
    const art = ctx.sources[SOURCE] as ArtData | undefined;
    let pic: Picture;
    if (art?.demo) pic = demoPicture(ctx.canvas, art);
    else if (art?.file) pic = await loadPicture(ctx.canvas, art);
    else return null;
    const { src, k } = prescaled(ctx.canvas, pic.img, pic.w, pic.h, W, H);
    const frames = Math.max(2, Math.round(ctx.options.seconds * FPS));
    const cap = captionOf(pic.work, ctx.locale, ctx.t, pic.stale);
    const s = sizesFor({ w: W, h: H });
    const n = H < s.lineH * 4 ? 1 : 3;
    const pad = Math.round(s.lineH * 0.6);
    const textW = Math.min(W - pad * 2, Math.max(260, W * 0.6));
    const kitCtx = { kit, theme: ctx.theme };
    const g0 = ctx.canvas.createCanvas(1, 1).getContext('2d');
    // When it doesn't all fit, in turns (the title, then the credit; on one line, also the artist): a part of the time each.
    const turns: ReturnType<typeof captionLines>[] = [];
    for (let k = 0; k < 6; k++) {
      const l = captionLines(g0 as never, kitCtx as never, cap, textW, n, s, k);
      if (k > 0 && JSON.stringify(l) === JSON.stringify(turns[0])) break;
      turns.push(l);
    }
    return {
      frames,
      draw(g: Graphics, i: number) {
        const r = kenBurns(pic.w, pic.h, W, H, pic.look, frames > 1 ? i / (frames - 1) : 0, ctx.options.motion);
        g.fillStyle = pic.look.bg;
        g.fillRect(0, 0, W, H);
        g.drawImage(src, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, W, H);
        const lines = turns[Math.min(turns.length - 1, Math.floor((i / frames) * turns.length))]!;
        const heights = lines.map((l) => Math.round(l.size * 1.38));
        const blockH = heights.reduce((a, b) => a + b, 0) + pad * (n > 1 ? 1.2 : 0.5);
        const shade = g.createLinearGradient(0, H - blockH * 1.6, 0, H);
        shade.addColorStop(0, 'rgba(0,0,0,0)');
        shade.addColorStop(0.45, 'rgba(0,0,0,0.5)');
        shade.addColorStop(1, 'rgba(0,0,0,0.75)');
        g.fillStyle = shade;
        g.fillRect(0, Math.max(0, H - blockH * 1.6), W, Math.min(H, blockH * 1.6));
        let y = H - blockH + (n > 1 ? pad * 0.6 : pad * 0.25);
        lines.forEach((l, j) => {
          y += heights[j]!;
          kit.drawTracked(g, l.text, pad, y - heights[j]! * 0.28, { size: l.size, family: l.bold ? ctx.theme.fonts.sansBold : ctx.theme.fonts.sans, color: `rgba(242,238,230,${l.alpha})` });
        });
      },
    };
  },
});
