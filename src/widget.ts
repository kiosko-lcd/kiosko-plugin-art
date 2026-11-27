/**
 * `art/work`: the work of the day, fitted to the tile: whole on squarish
 * tiles (on a background drawn from its colours), the most interesting band
 * on long strips, with its title, artist, year, museum and licence always on
 * screen: beside or under it when the tile leaves room, over its bottom edge
 * when not. Where one or two lines are all that fit, they take turns every
 * 20 s: the title and artist, then the museum and licence.
 */
import { defineWidget, t, type Graphics, type RenderContext } from '@kiosko/sdk';
import { captionOf, type Caption } from './credit.ts';
import { demoArt, demoPicture } from './demo.ts';
import { L } from './i18n.ts';
import { frameFor, type CaptionMode, type Fit } from './layout.ts';
import { LOADING, WAITING } from './labels.ts';
import { loadPicture, type Picture } from './picture.ts';
import { noteBox } from './sizes.ts';
import { SOURCE } from './source-id.ts';
import type { ArtData } from './types.ts';

/** The smallest text drawn, in px of the box: readable on a panel across the desk. */
export const MIN_PX = 11;
/** How long each of two alternating captions stays. */
export const TURN_MS = 20_000;

type Ctx = RenderContext<{ fit: Fit; caption: CaptionMode }, Picture | undefined>;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Text sizes for a box: the title and the rest. Never under `MIN_PX`. */
export function sizesFor(box: { w: number; h: number }): { title: number; body: number; lineH: number } {
  const body = clamp(Math.round(Math.min(box.h * 0.07, box.w / 24)), MIN_PX, 18);
  const title = clamp(Math.round(body * 1.2), MIN_PX + 1, 22);
  return { title, body, lineH: Math.round(title * 1.38) };
}

interface Line {
  text: string;
  size: number;
  bold?: boolean;
  alpha: number;
}

/**
 * The caption's lines for a box that holds `n`: everything when it fits
 * (the title on two lines if there's room, the credit wrapped as needed),
 * else in turns by `phase` (a count of `TURN_MS`): the title and byline, then
 * the credit, as many pages of `n` lines as it takes (on a single line, the
 * title, the byline and the credit each on its own).
 */
export function captionLines(g: Graphics, ctx: Pick<Ctx, 'kit' | 'theme'>, cap: Caption, w: number, n: number, s: { title: number; body: number }, phase: number): Line[] {
  const { kit, theme } = ctx;
  const fb = { size: s.title, family: theme.fonts.sansBold };
  const fr = { size: s.body, family: theme.fonts.sans };
  const wrap = (text: string, font: typeof fr, max: number) => (max > 0 ? kit.wrapLines(g, text, w, max, font) : []);
  const credit = wrap(cap.credit, fr, 3);
  const byline = cap.byline ? 1 : 0;
  const titleRoom = n - credit.length - byline;
  if (titleRoom >= 1) {
    const title = wrap(cap.title, fb, Math.min(2, titleRoom));
    return [
      ...title.map((text) => ({ text, size: s.title, bold: true, alpha: 1 })),
      ...(byline ? [{ text: kit.truncate(g, cap.byline, w, fr), size: s.body, alpha: 0.82 }] : []),
      ...credit.map((text) => ({ text, size: s.body, alpha: 0.62 })),
    ];
  }
  // Not all at once: in turns. The title (and byline), then the credit, a page of `n` lines at a time.
  const pages: Line[][] = [];
  const creditLines = wrap(cap.credit, fr, 12);
  if (n >= 2) {
    const title = wrap(cap.title, fb, n - byline);
    pages.push([...title.map((text) => ({ text, size: s.title, bold: true, alpha: 1 })), ...(byline ? [{ text: kit.truncate(g, cap.byline, w, fr), size: s.body, alpha: 0.82 }] : [])]);
  } else {
    pages.push([{ text: kit.truncate(g, cap.title, w, { ...fr, family: theme.fonts.sansBold }), size: s.body, bold: true, alpha: 1 }]);
    if (cap.byline) pages.push([{ text: kit.truncate(g, cap.byline, w, fr), size: s.body, alpha: 1 }]);
  }
  for (let i = 0; i < creditLines.length; i += n) pages.push(creditLines.slice(i, i + n).map((text) => ({ text, size: s.body, alpha: 0.85 })));
  return pages[phase % pages.length]!;
}

/** Light ink on the work's own dark background or on the shade over it. */
const INK = '242,238,230';

function drawLines(g: Graphics, ctx: Ctx, lines: Line[], box: { x: number; y: number; w: number; h: number }, lineH: number, valign: 'middle' | 'bottom' | 'top') {
  const { kit, theme } = ctx;
  const heights = lines.map((l) => Math.round(l.size * 1.38));
  const total = heights.reduce((a, b) => a + b, 0);
  let y = valign === 'top' ? box.y + lineH * 0.3 : valign === 'bottom' ? box.y + box.h - total - lineH * 0.25 : box.y + (box.h - total) / 2;
  lines.forEach((l, i) => {
    y += heights[i]!;
    kit.drawTracked(g, l.text, box.x, y - heights[i]! * 0.28, { size: l.size, family: l.bold ? theme.fonts.sansBold : theme.fonts.sans, color: `rgba(${INK},${l.alpha})` });
  });
}

function message(g: Graphics, ctx: Ctx, text: string) {
  const { box, kit, theme } = ctx;
  const size = clamp(Math.round(Math.min(box.h * 0.22, box.w / 14)), MIN_PX, 22);
  const font = { size, family: theme.fonts.sans, color: theme.colors.inkDim };
  kit.drawTracked(g, kit.truncate(g, text, box.w, font), box.x, box.y + box.h / 2 + size * 0.35, font);
}

/** Paints a picture with its caption in `ctx.box` (also used by the store screenshots and the tests). */
export function paintWork(g: Graphics, ctx: Ctx, pic: Picture, stale = pic.stale): void {
  const { box, now } = ctx;
  const s = sizesFor(box);
  // Tall tiles have room under the work for a longer caption.
  const lines = box.h < s.lineH * 2.2 ? 1 : box.h >= box.w * 1.3 && box.h >= 300 ? 5 : 3;
  const frame = frameFor(box, pic.w, pic.h, pic.look, { lineH: s.lineH, lines, fit: ctx.options.fit, caption: ctx.options.caption });
  g.fillStyle = pic.look.bg;
  g.fillRect(box.x, box.y, box.w, box.h);
  const { src, dst } = frame.place;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(pic.img, src.x, src.y, src.w, src.h, dst.x, dst.y, dst.w, dst.h);
  const cap = captionOf(pic.work, ctx.locale, ctx.t, stale);
  const phase = Math.floor(now / TURN_MS);
  const c = frame.caption;
  if (frame.overlay) {
    const pad = Math.round(s.lineH * 0.45);
    const n = Math.max(1, Math.min(3, Math.floor((c.h - (c.h > s.lineH * 1.5 ? pad : 0)) / s.lineH)));
    const text = captionLines(g, ctx, cap, c.w - pad * 2, n, s, phase);
    // A shade from clear to dark, so light text reads over any picture.
    const shade = g.createLinearGradient(0, c.y - c.h * 0.35, 0, c.y + c.h);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(0.35, 'rgba(0,0,0,0.55)');
    shade.addColorStop(1, 'rgba(0,0,0,0.78)');
    g.fillStyle = shade;
    g.fillRect(box.x, Math.max(box.y, c.y - c.h * 0.35), box.w, box.y + box.h - Math.max(box.y, c.y - c.h * 0.35));
    drawLines(g, ctx, text, { x: c.x + pad, y: c.y, w: c.w - pad * 2, h: c.h }, s.lineH, n === 1 ? 'middle' : 'bottom');
    return;
  }
  const n = Math.max(1, Math.floor((c.h - s.lineH * 0.3) / s.lineH));
  const text = captionLines(g, ctx, cap, c.w, Math.min(n, 7), s, phase);
  // Under the work: from the top of its panel; beside it: in the middle.
  drawLines(g, ctx, text, c, s.lineH, c.y > box.y + 1 ? 'top' : 'middle');
}

function render(g: Graphics, ctx: Ctx): void {
  const { box } = ctx;
  noteBox(box.w, box.h, ctx.now);
  const art = ctx.sources[SOURCE] as ArtData | undefined;
  const pic = ctx.data ?? (art?.demo ? demoPicture(ctx.canvas, art) : undefined);
  if (!pic) return message(g, ctx, ctx.t(art ? LOADING : WAITING));
  paintWork(g, ctx, pic);
}

export const workOptions = t.object({
  fit: t.enum(['auto', 'whole', 'fill'] as const, {
    default: 'auto',
    label: L('Fit', 'Ajuste', 'Einpassen', '缩放方式', '縮放方式'),
    labels: {
      auto: L('By the tile’s shape', 'Según la forma del hueco', 'Nach Form der Kachel', '按方块形状', '依方塊形狀'),
      whole: L('Always whole', 'Siempre entera', 'Immer ganz', '始终完整', '一律完整'),
      fill: L('Always fill (the best part)', 'Siempre llenar (la mejor parte)', 'Immer füllen (der beste Teil)', '始终填满（最精彩的部分）', '一律填滿（最精彩的部分）'),
    },
    help: L(
      'By the tile’s shape: whole when it fills most of the tile, else the most interesting part of it (on a long strip, the best band).',
      'Según la forma: entera cuando llena casi todo el hueco; si no, su parte más interesante (en una barra larga, la mejor franja).',
      'Nach Form: ganz, wenn es den Großteil der Kachel füllt, sonst sein interessantester Teil (auf einer langen Leiste der beste Streifen).',
      '按形状：能填满方块大部分时显示完整作品，否则显示最有看点的部分（长条上为最佳的一段）。',
      '依形狀：能填滿方塊大部分時顯示完整作品，否則顯示最有看頭的部分（長條上為最佳的一段）。',
    ),
  }),
  caption: t.enum(['auto', 'panel', 'overlay'] as const, {
    default: 'auto',
    label: L('Caption', 'Rótulo', 'Bildunterschrift', '说明文字', '說明文字'),
    labels: {
      auto: L('Beside or under the work when there is room', 'Al lado o debajo de la obra si cabe', 'Neben oder unter dem Werk, wenn Platz ist', '有空间时放在作品旁边或下方', '有空間時放在作品旁邊或下方'),
      panel: L('Beside or under, making room', 'Al lado o debajo, haciendo sitio', 'Daneben oder darunter, mit Platz', '放在旁边或下方，并留出空间', '放在旁邊或下方，並留出空間'),
      overlay: L('Over the work', 'Sobre la obra', 'Über dem Werk', '叠在作品上', '疊在作品上'),
    },
    help: L(
      'Title, artist, year, museum and licence are always shown: the museums’ terms ask for the credit.',
      'Título, autor, año, museo y licencia siempre se muestran: los museos piden el crédito.',
      'Titel, Künstler, Jahr, Museum und Lizenz werden immer gezeigt: Die Museen verlangen die Nennung.',
      '标题、作者、年代、博物馆和授权始终显示：博物馆要求注明出处。',
      '標題、作者、年代、博物館和授權始終顯示：博物館要求標示出處。',
    ),
  }),
});

export const work = defineWidget<typeof workOptions, Picture | undefined>({
  id: 'work',
  name: L('Work of the day', 'Obra del día', 'Werk des Tages', '每日一作', '每日一作'),
  description: L(
    "A public-domain painting, photograph or print from a great museum, a different one each day, fitted to the tile: whole on squarish tiles, the most interesting band on long strips. Its title, artist, year, museum and licence are always on screen.",
    'Un cuadro, una fotografía o un grabado de dominio público de un gran museo, uno distinto cada día, encajado al hueco: entero en los cuadrados, la franja más interesante en las barras largas. Su título, autor, año, museo y licencia siempre en pantalla.',
    'Ein gemeinfreies Gemälde, Foto oder Druckwerk aus einem großen Museum, jeden Tag ein anderes, passend zur Kachel: ganz auf quadratischen Kacheln, der interessanteste Streifen auf langen Leisten. Titel, Künstler, Jahr, Museum und Lizenz stehen immer auf dem Bildschirm.',
    '来自大型博物馆的公有领域绘画、摄影或版画，每天一件，按方块形状呈现：方形方块显示完整作品，长条只显示最有看点的一段。标题、作者、年代、博物馆和授权始终显示在屏幕上。',
    '來自大型博物館的公有領域繪畫、攝影或版畫，每天一件，依方塊形狀呈現：方形方塊顯示完整作品，長條只顯示最有看頭的一段。標題、作者、年代、博物館和授權始終顯示在螢幕上。',
  ),
  icon: 'image',
  category: 'media',
  tags: ['art', 'museum', 'painting', 'public-domain', 'photo'],
  chrome: 'bare',
  size: { min: { w: 120, h: 30 }, preferred: { w: 480, h: 320 } },
  sources: [SOURCE],
  options: workOptions,
  intervalMs: 60_000,
  // Until the picture is in, look again soon.
  intervalOf: ({ data }) => (data ? undefined : 10_000),
  timeoutMs: 60_000,
  async fetch(ctx): Promise<Picture | undefined> {
    const art = ctx.sources[SOURCE] as ArtData | undefined;
    if (!art || art.demo || !art.file) return undefined;
    return loadPicture(ctx.canvas, art);
  },
  // Today's work is chosen but its picture isn't in (no file, or not loaded yet).
  empty: ({ data, sources }) => {
    const art = sources[SOURCE] as ArtData | undefined;
    return !!art && !art.demo && !data;
  },
  redraw: { everyMs: TURN_MS },
  render(g, ctx) {
    const { box } = ctx;
    g.save();
    g.beginPath();
    g.rect(box.x, box.y, box.w, box.h);
    g.clip();
    try {
      render(g, ctx as Ctx);
    } finally {
      g.restore();
    }
  },
  demo: ({ now }) => ({ sources: { [SOURCE]: demoArt(now) } }),
});
