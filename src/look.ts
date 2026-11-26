/**
 * What the widget needs to know about a picture to frame it, worked out
 * once from a thumbnail of it (about 96 px):
 *
 * - a background derived from its colours, for the bars around it and the
 *   caption panel: its average colour, darkened to a deep shade of itself;
 * - how "interesting" each row and each column is, for the smart crop: the
 *   local contrast (edges, texture, faces, figures) plus some colour, with
 *   flat areas (a sky, a wall, a mount, a frame) counting little. A long strip
 *   shows the band where that sum is highest.
 */

export type RGB = [number, number, number];

export interface Look {
  /** Deep shade of the picture's average colour: `rgb(…)`. */
  bg: string;
  bgRgb: RGB;
  /** Interest of each row (top to bottom) and column (left to right), 0..1, of the thumbnail. */
  rows: number[];
  cols: number[];
}

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** The background: the average colour, brought to about 9 % luminance, a third of the way to neutral. */
export function backgroundOf(mean: RGB): RGB {
  const l = Math.max(1, lum(...mean));
  const k = 24 / l;
  const neutral: RGB = [18, 18, 20];
  return mean.map((c, i) => Math.round(Math.min(255, c * k) * 0.66 + neutral[i]! * 0.34)) as RGB;
}

function smooth(v: number[], r: number): number[] {
  return v.map((_, i) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(v.length - 1, i + r); j++) (s += v[j]!), n++;
    return s / n;
  });
}

const normalise = (v: number[]) => {
  const max = Math.max(...v, 1e-9);
  return v.map((x) => x / max);
};

/** Reads a thumbnail's pixels (RGBA, `w`×`h`). */
export function analyse(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Look {
  const L = new Float32Array(w * h);
  const sat = new Float32Array(w * h);
  const mean: RGB = [0, 0, 0];
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4]!, g = rgba[i * 4 + 1]!, b = rgba[i * 4 + 2]!;
    L[i] = lum(r, g, b);
    sat[i] = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    mean[0] += r;
    mean[1] += g;
    mean[2] += b;
  }
  const n = Math.max(1, w * h);
  const avg = mean.map((c) => c / n) as RGB;
  const rows = new Array<number>(h).fill(0);
  const cols = new Array<number>(w).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const gx = Math.abs(L[y * w + Math.min(w - 1, x + 1)]! - L[y * w + Math.max(0, x - 1)]!);
      const gy = Math.abs(L[Math.min(h - 1, y + 1) * w + x]! - L[Math.max(0, y - 1) * w + x]!);
      // Contrast, in 0..1 of the full range, and a little colour.
      const e = (gx + gy) / 255 + 0.12 * sat[i]!;
      rows[y]! += e;
      cols[x]! += e;
    }
  }
  const bgRgb = backgroundOf(avg);
  return {
    bg: `rgb(${bgRgb.join(',')})`,
    bgRgb,
    rows: normalise(smooth(rows.map((v) => v / w), 1)),
    cols: normalise(smooth(cols.map((v) => v / h), 1)),
  };
}

/**
 * Where a window of `frac` of the profile's length (0..1) is most
 * interesting: its start, as a fraction. A slight pull towards the middle
 * settles near-ties (a flat picture is cropped in the centre).
 */
export function bestWindow(profile: number[], frac: number): number {
  const n = profile.length;
  if (!n || frac >= 1) return 0;
  const win = Math.max(1, Math.min(n, Math.round(frac * n)));
  const last = n - win;
  let sum = 0;
  for (let i = 0; i < win; i++) sum += profile[i]!;
  let best = -Infinity, at = last / 2;
  for (let s = 0; s <= last; s++) {
    if (s > 0) sum += profile[s + win - 1]! - profile[s - 1]!;
    const centre = (s + win / 2) / n - 0.5;
    const score = sum / win - 0.08 * Math.abs(centre);
    if (score > best + 1e-9) {
      best = score;
      at = s;
    }
  }
  return Math.max(0, Math.min(1 - frac, at / n));
}

/** A flat look, before a picture is analysed. */
export const FLAT_LOOK: Look = { bg: 'rgb(20,20,22)', bgRgb: [20, 20, 22], rows: [1], cols: [1] };

/**
 * The hue family of a pure, saturated colour, as a bit (red 1, yellow 2,
 * green 4, blue 8, magenta 16), or 0 for anything less pure: the patches of
 * a colour chart, not a painting's pigments.
 */
export function pureHue(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx - mn < 130 || mx < 150) return 0;
  const d = mx - mn;
  let hue = mx === r ? ((g - b) / d) * 60 : mx === g ? ((b - r) / d) * 60 + 120 : ((r - g) / d) * 60 + 240;
  if (hue < 0) hue += 360;
  if (hue < 20 || hue >= 330) return 1;
  if (hue >= 40 && hue < 75) return 2;
  if (hue >= 75 && hue < 170) return 4;
  if (hue >= 170 && hue < 260) return 8;
  if (hue >= 260 && hue < 330) return 16;
  return 0;
}

/**
 * Whether row `y` crosses a grey ramp: at least five flat steps of neutral
 * grey, each lighter (or each darker) than the last, from near black to near
 * white. An ink painting's greys are neither flat nor in order.
 */
export function isRamp(rgba: Uint8ClampedArray | Uint8Array, w: number, y: number): boolean {
  const steps: number[] = [];
  let run = 0, sum = 0, prev = -1;
  const close = () => {
    if (run >= 2) steps.push(sum / run);
    run = 0;
    sum = 0;
  };
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
    if (Math.max(r, g, b) - Math.min(r, g, b) >= 24) {
      close();
      prev = -1;
      continue;
    }
    const l = lum(r, g, b);
    if (prev >= 0 && Math.abs(l - prev) > 5) close();
    run++;
    sum += l;
    prev = l;
  }
  close();
  // Merge steps too close to tell apart, then look for an ordered run of five or more.
  const levels = steps.filter((v, i) => i === 0 || Math.abs(v - steps[i - 1]!) > 6);
  let best = 1, up = 1, down = 1, lo = 0, span = 0;
  for (let i = 1; i < levels.length; i++) {
    up = levels[i]! > levels[i - 1]! ? up + 1 : 1;
    down = levels[i]! < levels[i - 1]! ? down + 1 : 1;
    const len = Math.max(up, down);
    if (len > best) {
      best = len;
      lo = i - len + 1;
      span = Math.abs(levels[i]! - levels[lo]!);
    }
  }
  return best >= 5 && span >= 110;
}

const bits = (n: number) => {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
};

/**
 * The colour chart some museums photograph with the work (the National
 * Palace Museum's: grey and colour patches and a label, on black or on white,
 * along the top or bottom edge): how much of the bottom and of the top to
 * cut off, as fractions of the height. A band near the edge whose rows have
 * pure, saturated patches (or are largely black), ended by a few plain rows,
 * within 30 % of the height; or a black margin up to the work with a small
 * chart in it. Only for museums known to include one: a
 * painting can have such rows too.
 */
export function chartBands(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): { top: number; bottom: number } {
  const dark = new Array<number>(h).fill(0);
  const vivid = new Array<number>(h).fill(0);
  const spread = new Array<number>(h).fill(0);
  const mean = new Array<number>(h).fill(0);
  const bright = new Array<number>(h).fill(0);
  const hues = new Array<number>(h).fill(0);
  const neutralWhite = new Array<number>(h).fill(0);
  const tinted = new Array<number>(h).fill(0);
  const neutralDark = new Array<number>(h).fill(0);
  const pure = new Array<number>(h).fill(0);
  const rawPure = new Array<number>(h).fill(0);
  const rawHues = new Array<number>(h).fill(0);
  const ramp = new Array<boolean>(h).fill(false);
  for (let y = 0; y < h; y++) {
    ramp[y] = isRamp(rgba, w, y);
    let lo = 255, hi = 0;
    let runFam = 0, runLen = 0, pureShare = 0;
    const minRun = Math.max(3, Math.round(w * 0.03));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
      const l = lum(r, g, b);
      if (l < 45) dark[y]! += 1 / w;
      if (l > 232) bright[y]! += 1 / w;
      // A hue counts in a run of a chart's patch size; the line, if such patches make a good part of it.
      const fam = pureHue(r, g, b);
      if (fam) (rawPure[y]! += 1 / w), (rawHues[y]! |= fam);
      if (fam && fam === runFam) runLen++;
      else {
        if (runLen >= minRun) (hues[y]! |= runFam), (pureShare += runLen);
        runFam = fam;
        runLen = fam ? 1 : 0;
      }
      if (Math.max(r, g, b) - Math.min(r, g, b) < 14) {
        if (l > 220) neutralWhite[y]! += 1 / w;
        else if (l < 45) neutralDark[y]! += 1 / w;
      } else tinted[y]! += 1 / w;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 150) vivid[y]! += 1 / w;
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
      mean[y]! += l / w;
    }
    if (runLen >= minRun) (hues[y]! |= runFam), (pureShare += runLen);
    pure[y] = pureShare / w;
    if (pureShare < w * 0.25) hues[y] = 0;
    spread[y] = hi - lo;
  }
  const max = Math.floor(h * 0.3);
  /** A row of plain backdrop: light or dark grey, even. */
  const backdrop = (y: number) => spread[y]! < 40 && (mean[y]! > 200 || mean[y]! < 40);
  const band = (rows: number[]): number => {
    let colourful = 0, darkRows = 0, last = -1, plain = 0;
    let onBackdrop = false, ended = false;
    for (let k = 0; k < Math.min(rows.length, max + 3); k++) {
      const y = rows[k]!;
      const chart = vivid[y]! > 0.01 || dark[y]! > 0.08;
      if (chart) {
        if (vivid[y]! > 0.01) colourful++;
        if (dark[y]! > 0.08) darkRows++;
        last = k;
        plain = 0;
      } else if (last >= 0) {
        if (++plain >= 2 && spread[y]! < 60) {
          onBackdrop = backdrop(y);
          ended = true;
          break;
        }
      } else if (k > h * 0.08) return 0;
    }
    // A chart ends, on plain rows; a painting's edge just goes on.
    if (last < 1 || last + 1 > max || !ended) return 0;
    // Colour patches; or a grey scale, small and on a plain backdrop.
    const grey = darkRows >= 2 && onBackdrop && plain >= 2 && last + 1 <= h * 0.12;
    if (colourful < 2 && !grey) return 0;
    return Math.min(0.3, (last + 2) / h);
  };
  /**
   * The work on a black backdrop with the chart small in its margin: rows
   * mostly black (the margin, with the chart's few patches in it) from the
   * edge up to the work, which fills most of its rows. Only with patches of
   * colour and a white label in that margin: a night scene is dark at its
   * edge too.
   */
  const margin = (rows: number[]): number => {
    let n = 0, colourful = 0, label = 0;
    for (const y of rows) {
      if (dark[y]! < 0.55) break;
      if (vivid[y]! > 0.005) colourful++;
      if (bright[y]! > 0.01) label++;
      n++;
    }
    // Then the work itself: rows it fills mostly, right away.
    const next = rows.slice(n, n + 3);
    const work = next.length === 3 && next.filter((y) => dark[y]! < 0.35).length >= 2;
    return n >= 2 && n <= max && colourful >= 2 && label >= 2 && work ? Math.min(0.3, n / h) : 0;
  };
  /**
   * Whatever the backdrop: the patches themselves. Rows near the edge
   * crossing patches (runs of a pure colour, together a quarter of the row
   * or more) of at least three hues (a painting's seals are
   * one red, a robe one yellow; mineral greens and blues aren't that pure); the cut goes past the
   * deepest of them, starting in the outer eighth.
   */
  const patches = (rows: number[]): number => {
    let first = -1, last = -1;
    for (let k = 0; k < Math.min(rows.length, max); k++) {
      if (bits(hues[rows[k]!]!) < 3) continue;
      if (first < 0) first = k;
      last = k;
    }
    if (first < 0 || first > h * 0.125 || last - first < 1) return 0;
    return Math.min(0.3, (last + 3) / h);
  };
  /**
   * Grey ramps, white label cards and a light neutral backdrop along the
   * edge: lines with a grey ramp, or largely of neutral white (the text of a
   * label may leave a few lines without). Old paper and silk
   * are cream, never neutral, so this stops at the work or its mount.
   */
  const neutral = (rows: number[]): number => {
    let last = -1, gap = 0;
    const limit = Math.floor(h * 0.25);
    for (let k = 0; k < Math.min(rows.length, limit); k++) {
      const y = rows[k]!;
      // The work (or its mount) across most of the line: stop.
      if (last >= 0 && tinted[y]! >= 0.85) break;
      if (ramp[y] || neutralWhite[y]! >= 0.22) {
        last = k;
        gap = 0;
      } else if (++gap > Math.max(3, Math.round(h * 0.04))) break;
    }
    if (last < 1) return 0;
    // A label or a ramp ends at the work: a tinted line (its mount, its silk) right after. White paper just goes on.
    const after = rows.slice(last + 1, last + 1 + Math.max(3, Math.round(h * 0.04)));
    let families = 0, ramps = 0;
    for (let k = 0; k <= last; k++) (families |= rawHues[rows[k]!]!), (ramps += ramp[rows[k]!] ? 1 : 0);
    // (Or a plain grey backdrop between it and the work.)
    const ends = after.some((y) => tinted[y]! >= 0.6 || (tinted[y]! < 0.1 && neutralWhite[y]! < 0.22));
    if (!ramps && bits(families) < 3 && !ends) return 0;
    return Math.min(0.25, (last + 3) / h);
  };

  /**
   * A chart's band, whatever its layout: from the edge, rows mostly of
   * neutral greys, black and white (the backdrop, the label, the grey
   * patches) and pure colours (the colour patches). Old paper and silk are
   * tinted: a painting's rows score little.
   */
  const chartish = (rows: number[]): number => {
    const score = (y: number) => 1 - tinted[y]! + rawPure[y]! + (ramp[y] ? 0.5 : 0);
    let last = -1, gap = 0;
    const tolerance = Math.max(2, Math.round(h * 0.03));
    for (let k = 0; k < Math.min(rows.length, max); k++) {
      if (score(rows[k]!) >= 0.45) {
        if (last < 0 && k > h * 0.06) return 0;
        last = k;
        gap = 0;
      } else if (last >= 0 && ++gap > tolerance) break;
      else if (last < 0 && k > h * 0.06) return 0;
    }
    if (last < 1 || last + 1 >= max) return 0;
    // Only with a chart in it: a grey ramp, or patches of three hues (a painting on white paper is neutral too).
    let families = 0, ramps = 0;
    for (let k = 0; k <= last; k++) (families |= rawHues[rows[k]!]!), (ramps += ramp[rows[k]!] ? 1 : 0);
    if (!ramps && bits(families) < 3) return 0;
    return Math.min(0.3, (last + 2) / h);
  };
  const ys = Array.from({ length: h }, (_, i) => i);
  const sy = [...ys].reverse();
  return { top: Math.max(band(ys), margin(ys), patches(ys), neutral(ys), chartish(ys)), bottom: Math.max(band(sy), margin(sy), patches(sy), neutral(sy), chartish(sy)) };
}

/** The same image turned a quarter (columns become rows), to look for a chart along the left or right edge. */
export function transpose(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = (y * w + x) * 4, b = (x * h + y) * 4;
      out[b] = rgba[a]!;
      out[b + 1] = rgba[a + 1]!;
      out[b + 2] = rgba[a + 2]!;
      out[b + 3] = rgba[a + 3]!;
    }
  return out;
}

/** A chart along any edge: how much to cut off each side, as fractions. */
export function chartEdges(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): { top: number; bottom: number; left: number; right: number } {
  const { top, bottom } = chartBands(rgba, w, h);
  const side = chartBands(transpose(rgba, w, h), h, w);
  return { top, bottom, left: side.top, right: side.bottom };
}

/**
 * The work itself on a museum photograph: the largest connected region that
 * differs from the backdrop (the colour of the picture's border), its parts
 * joined across small gaps. Charts, rulers and labels set apart on the
 * backdrop are other regions, left out. As fractions to keep: `{ x0, y0, x1,
 * y1 }`, or null when there is no clear backdrop or no clear work (a
 * picture that fills the frame).
 */
export function workBlock(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } | null {
  // The backdrop: the median colour of a 2-pixel border.
  const border: number[][] = [[], [], []];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x > 1 && y > 1 && x < w - 2 && y < h - 2) continue;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) border[c]!.push(rgba[i + c]!);
    }
  const bg = border.map((v) => v.sort((a, b) => a - b)[v.length >> 1]!);
  // How much of the border is that colour: a picture to the edge has no backdrop.
  let plain = 0;
  for (let k = 0; k < border[0]!.length; k++) if (Math.abs(border[0]![k]! - bg[0]!) + Math.abs(border[1]![k]! - bg[1]!) + Math.abs(border[2]![k]! - bg[2]!) < 45) plain++;
  if (plain < border[0]!.length * 0.6) return null;
  // Museums photograph on a neutral backdrop (grey, black, white); silk and paper are tinted.
  if (Math.max(...bg) - Math.min(...bg) >= 20) return null;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = Math.abs(rgba[i * 4]! - bg[0]!) + Math.abs(rgba[i * 4 + 1]! - bg[1]!) + Math.abs(rgba[i * 4 + 2]! - bg[2]!) > 60 ? 1 : 0;
  // Joined across gaps of a pixel or two (a work's pale paper, the space between its columns of text).
  const r = 2;
  const grown = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!on[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) grown[yy * w + xx] = 1;
        }
    }
  const label = new Int32Array(w * h).fill(-1);
  let best = { n: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
  let total = 0;
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!grown[start] || label[start]! >= 0) continue;
    const c = { n: 0, x0: w, y0: h, x1: 0, y1: 0 };
    label[start] = start;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i / w) | 0;
      c.n++;
      c.x0 = Math.min(c.x0, x);
      c.x1 = Math.max(c.x1, x);
      c.y0 = Math.min(c.y0, y);
      c.y1 = Math.max(c.y1, y);
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && grown[j] && label[j]! < 0) {
          label[j] = start;
          stack.push(j);
        }
      }
    }
    total += c.n;
    if (c.n > best.n) best = c;
  }
  if (!best.n) return null;
  const area = (best.x1 - best.x0 + 1) * (best.y1 - best.y0 + 1);
  // The work is most of the picture, and something else was there to leave out.
  if (area < w * h * 0.3 || best.n > total * 0.995) return null;
  // And what is left out looks like a chart, a ramp or a label (pure colours of two hues, neutral greys, white): not a part of the painting.
  let families = 0, white = 0, greys = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x >= best.x0 && x <= best.x1 && y >= best.y0 && y <= best.y1) continue;
      const i = (y * w + x) * 4;
      const rr = rgba[i]!, gg = rgba[i + 1]!, bb = rgba[i + 2]!;
      const neutralPx = Math.max(rr, gg, bb) - Math.min(rr, gg, bb) < 14;
      // A white label may be the backdrop's colour: count it wherever it is.
      if (neutralPx && lum(rr, gg, bb) > 240) white++;
      if (!on[y * w + x]) continue;
      families |= pureHue(rr, gg, bb);
      if (neutralPx) greys++;
    }
  if (bits(families) < 2 && greys < w * h * 0.005 && white < w * h * 0.005) return null;
  // Back to the work's own edge (the growing added `r`), less a pixel for safety.
  const pad = r - 1;
  return { x0: Math.max(0, best.x0 + pad) / w, y0: Math.max(0, best.y0 + pad) / h, x1: Math.min(w, best.x1 + 1 - pad) / w, y1: Math.min(h, best.y1 + 1 - pad) / h };
}
