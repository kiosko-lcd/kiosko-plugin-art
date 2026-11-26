import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { testCanvas } from './fixtures.ts';
import { frameFor, placeWork } from './layout.ts';
import { analyse, bestWindow, chartBands } from './look.ts';
import { chartCrop, lookOf, withoutChart } from './picture.ts';

const api = { createCanvas } as never;
const lookOfCanvas = (c: ReturnType<typeof testCanvas>) => lookOf(api, c as never, c.width, c.height);

test('smart crop: a long strip shows the busy band, wherever it is', () => {
  for (const [from, to] of [[0.65, 0.8], [0.1, 0.22], [0.45, 0.55]] as const) {
    const c = testCanvas(900, 600, { band: { from, to } });
    const look = lookOfCanvas(c);
    const p = placeWork(900, 600, { x: 0, y: 0, w: 1920, h: 140 }, look);
    assert.equal(p.mode, 'cover');
    const mid = (p.src.y + p.src.h / 2) / 600;
    assert.ok(mid > from - 0.02 && mid < to + 0.02, `band ${from}-${to}: crop centred at ${mid.toFixed(2)}`);
  }
});

test('smart crop on a tall strip: the busy column', () => {
  const c = testCanvas(600, 600, { band: { from: 0.75, to: 0.9, axis: 'x' } });
  const p = placeWork(600, 600, { x: 0, y: 0, w: 120, h: 600 }, lookOfCanvas(c));
  const mid = (p.src.x + p.src.w / 2) / 600;
  assert.ok(mid > 0.72 && mid < 0.93, `${mid}`);
});

test('a flat picture is cropped in the middle; a squarish tile shows it whole', () => {
  const look = lookOfCanvas(testCanvas(800, 600));
  const p = placeWork(800, 600, { x: 0, y: 0, w: 1920, h: 140 }, look);
  assert.ok(Math.abs(p.src.y + p.src.h / 2 - 300) < 15);
  const whole = placeWork(800, 600, { x: 0, y: 0, w: 320, h: 320 }, look);
  assert.equal(whole.mode, 'contain');
  assert.deepEqual(whole.src, { x: 0, y: 0, w: 800, h: 600 });
  assert.equal(bestWindow([0, 0, 0, 0, 1, 1, 0, 0, 0, 0], 0.2), 0.4);
});

test('the background is a deep shade of the picture’s own colour', () => {
  const red = analyse(new Uint8ClampedArray(Array.from({ length: 400 }, (_, i) => [200, 40, 30, 255][i % 4]!)), 10, 10);
  const [r, g, b] = red.bgRgb;
  assert.ok(r > g && r > b, red.bg);
  assert.ok(0.2126 * r + 0.7152 * g + 0.0722 * b < 40, 'dark enough for light text');
});

test('caption room: beside on long strips, under on tall tiles, in the spare room on squarish ones, over it on tiny ones', () => {
  const look = { rows: [1], cols: [1] };
  const o = { lineH: 18, lines: 3 };
  const strip = frameFor({ x: 0, y: 0, w: 1920, h: 140 }, 900, 600, look, o);
  assert.equal(strip.overlay, false);
  assert.ok(strip.caption.x > 1400);
  const tall = frameFor({ x: 0, y: 0, w: 172, h: 320 }, 900, 600, look, o);
  assert.equal(tall.overlay, false);
  assert.ok(tall.caption.y > 200);
  // A portrait in a landscape tile: whole, the caption in the room at its side.
  const side = frameFor({ x: 0, y: 0, w: 480, h: 320 }, 600, 900, look, o);
  assert.equal(side.place.mode, 'contain');
  assert.equal(side.overlay, false);
  assert.ok(side.caption.x >= side.place.dst.x + side.place.dst.w);
  const tiny = frameFor({ x: 0, y: 0, w: 140, h: 30 }, 900, 600, look, { lineH: 15, lines: 1 });
  assert.equal(tiny.overlay, true);
  assert.equal(frameFor({ x: 0, y: 0, w: 480, h: 320 }, 600, 900, look, { ...o, caption: 'overlay' }).overlay, true);
});

/** A painting on a mount with a colour chart on black along the bottom, as the National Palace Museum photographs them. */
function withChart(w: number, h: number, chartH: number) {
  const c = testCanvas(w, h, { color: '#D9C9A3', band: { from: 0.2, to: 0.6 } });
  const g = c.getContext('2d');
  g.fillStyle = '#111111';
  g.fillRect(0, h - chartH, w, chartH);
  const colours = ['#FFFFFF', '#E6007E', '#E30613', '#FFED00', '#009640', '#009FE3', '#312783', '#888888'];
  colours.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(10 + i * (w * 0.05), h - chartH * 0.8, w * 0.05, chartH * 0.6);
  });
  return c;
}

test('a colour chart along the bottom is found and cut off; a dark painting is left alone', () => {
  const c = withChart(800, 600, 70);
  const { tw, th, data } = (() => {
    const t = createCanvas(160, 120);
    t.getContext('2d').drawImage(c, 0, 0, 160, 120);
    return { tw: 160, th: 120, data: t.getContext('2d').getImageData(0, 0, 160, 120).data };
  })();
  const bands = chartBands(data, tw, th);
  assert.equal(bands.top, 0);
  assert.ok(bands.bottom >= 70 / 600 && bands.bottom < 0.16, `${bands.bottom}`);
  const cut = withoutChart(api, c as never, 800, 600);
  assert.ok(cut.h <= 530 && cut.h > 480, `${cut.h}`);
  // A night scene: dark at the bottom, all the way up: no chart.
  const night = testCanvas(800, 600, { color: '#0E0E12', band: { from: 0.8, to: 0.95 } });
  assert.equal(withoutChart(api, night as never, 800, 600).h, 600);
});

test('a grey scale on a light backdrop at the top is cut off too', () => {
  const c = createCanvas(600, 800);
  const g = c.getContext('2d');
  g.fillStyle = '#DCDCDC';
  g.fillRect(0, 0, 600, 800);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgb(${i * 25},${i * 25},${i * 25})`;
    g.fillRect(20 + i * 40, 25, 40, 60);
  }
  g.drawImage(testCanvas(500, 600, { color: '#C8B48A', band: { from: 0.2, to: 0.7 } }), 50, 150);
  const r = chartCrop(api, c as never, 600, 800);
  assert.ok(r.y >= 85, `the grey scale is cut off: ${JSON.stringify(r)}`);
  assert.ok(contains(r, { x: 50, y: 150, w: 500, h: 600 }), `the work is kept: ${JSON.stringify(r)}`);
});

test('a chart along the right edge, on black, is cut off', () => {
  const c = createCanvas(800, 600);
  const g = c.getContext('2d');
  g.drawImage(testCanvas(700, 600, { color: '#D9C9A3' }), 0, 0);
  g.fillStyle = '#0A0A0A';
  g.fillRect(700, 0, 100, 600);
  ['#E30613', '#FFED00', '#009640', '#009FE3', '#E6007E', '#FFFFFF'].forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(720, 40 + i * 40, 50, 40);
  });
  const cut = withoutChart(api, c as never, 800, 600);
  assert.equal(cut.h, 600);
  assert.ok(cut.w <= 705 && cut.w > 670, `${cut.w}`);
});

/**
 * The National Palace Museum's other layout: the work on a black backdrop,
 * with a small chart (a few colour patches, a grey scale, a white label)
 * in the black margin along one edge, a little apart from the work.
 */
function onBlack(edge: 'top' | 'right', w = 800, h = 600) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#121212';
  g.fillRect(0, 0, w, h);
  const m = edge === 'top' ? { x: 60, y: 110, w: w - 120, h: h - 140 } : { x: 30, y: 30, w: w - 150, h: h - 60 };
  g.drawImage(testCanvas(m.w, m.h, { color: '#E8E2D4' }), m.x, m.y);
  // A few strokes of ink on the work.
  g.fillStyle = '#3A3A3A';
  for (let i = 0; i < 12; i++) g.fillRect(m.x + 40 + i * 37, m.y + 60 + (i % 4) * 50, 18, 120);
  const patch = (x: number, y: number, pw: number, ph: number, col: string) => ((g.fillStyle = col), g.fillRect(x, y, pw, ph));
  const colours = ['#E30613', '#FFED00', '#009640', '#009FE3', '#E6007E', '#312783'];
  if (edge === 'top') {
    colours.forEach((col, i) => patch(240 + i * 14, 20, 14, 26, col));
    for (let i = 0; i < 8; i++) patch(240 + i * 12, 50, 12, 20, `rgb(${i * 32},${i * 32},${i * 32})`);
    patch(380, 22, 90, 40, '#F4F4F4');
  } else {
    colours.forEach((col, i) => patch(w - 80, 160 + i * 14, 26, 14, col));
    for (let i = 0; i < 8; i++) patch(w - 50, 160 + i * 12, 20, 12, `rgb(${i * 32},${i * 32},${i * 32})`);
    patch(w - 84, 300, 44, 90, '#F4F4F4');
  }
  return { c, m };
}

test('a small chart in a black margin, apart from the work, along the top or the right, is cut off; the work stays whole', () => {
  for (const edge of ['top', 'right'] as const) {
    const { c, m } = onBlack(edge);
    const r = chartCrop(api, c as never, 800, 600);
    assert.ok(contains(r, m), `${edge}: the work is kept (${JSON.stringify(r)})`);
    const chart = edge === 'top' ? { x: 240, y: 20, w: 230, h: 50 } : { x: 720, y: 160, w: 60, h: 230 };
    assert.ok(!overlaps(r, chart), `${edge}: the chart is cut off (${JSON.stringify(r)})`);
  }
});

type Rect = { x: number; y: number; w: number; h: number };
const contains = (a: Rect, b: Rect, tol = 3) => b.x >= a.x - tol && b.y >= a.y - tol && b.x + b.w <= a.x + a.w + tol && b.y + b.h <= a.y + a.h + tol;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Layouts of the National Palace Museum's photographs: the work, and a chart strip, a grey ramp and a white label at its edges, on a light or a dark backdrop. */
function layout(o: { backdrop: string; strip?: 'left' | 'top'; ramp?: 'right' | 'bottom'; label?: 'right' | 'bottom' }) {
  const W = 900, H = 640;
  const c = createCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = o.backdrop;
  g.fillRect(0, 0, W, H);
  const work = { x: 90, y: 70, w: 690, h: 480 };
  g.drawImage(testCanvas(work.w, work.h, { color: '#D8C7A0', band: { from: 0.3, to: 0.7 } }), work.x, work.y);
  const charts: Rect[] = [];
  const colours = ['#1A1A1A', '#FFFFFF', '#E6007E', '#E30613', '#FFED00', '#009640', '#009FE3', '#312783'];
  if (o.strip === 'left') {
    colours.forEach((col, i) => ((g.fillStyle = col), g.fillRect(0, 30 + i * 60, 55, 60)));
    charts.push({ x: 0, y: 30, w: 55, h: 480 });
  }
  if (o.strip === 'top') {
    colours.forEach((col, i) => ((g.fillStyle = col), g.fillRect(150 + i * 60, 0, 60, 45)));
    charts.push({ x: 150, y: 0, w: 480, h: 45 });
  }
  if (o.ramp === 'right') {
    for (let i = 0; i < 12; i++) ((g.fillStyle = `rgb(${i * 22},${i * 22},${i * 22})`), g.fillRect(W - 50, 60 + i * 40, 40, 40));
    charts.push({ x: W - 50, y: 60, w: 40, h: 480 });
  }
  if (o.ramp === 'bottom') {
    for (let i = 0; i < 12; i++) ((g.fillStyle = `rgb(${i * 22},${i * 22},${i * 22})`), g.fillRect(420 + i * 30, H - 45, 30, 35));
    charts.push({ x: 420, y: H - 45, w: 360, h: 35 });
  }
  if (o.label === 'right') {
    g.fillStyle = '#F7F7F7';
    g.fillRect(W - 110, 200, 50, 300);
    g.fillStyle = '#222';
    for (let i = 0; i < 9; i++) g.fillRect(W - 95, 215 + i * 30, 20, 16);
    charts.push({ x: W - 110, y: 200, w: 50, h: 300 });
  }
  if (o.label === 'bottom') {
    g.fillStyle = '#F7F7F7';
    g.fillRect(120, H - 75, 280, 60);
    g.fillStyle = '#222';
    for (let i = 0; i < 10; i++) g.fillRect(135 + i * 25, H - 60, 16, 16);
    charts.push({ x: 120, y: H - 75, w: 280, h: 60 });
  }
  return { c, work, charts, W, H };
}

test('charts, grey ramps and labels on any side, on light or dark backdrops: cut off, the work kept whole', () => {
  const cases = [
    { backdrop: '#DADAD8', strip: 'left', ramp: 'right', label: 'bottom' },
    { backdrop: '#DADAD8', strip: 'top', label: 'right' },
    { backdrop: '#141414', strip: 'left', ramp: 'bottom', label: 'right' },
    { backdrop: '#141414', strip: 'top', ramp: 'right' },
    { backdrop: '#F2F2F2', ramp: 'bottom', label: 'bottom' },
  ] as const;
  for (const o of cases) {
    const { c, work, charts, W, H } = layout(o);
    const r = chartCrop(api, c as never, W, H);
    assert.ok(contains(r, work), `${JSON.stringify(o)}: the work is kept (${JSON.stringify(r)})`);
    for (const ch of charts) assert.ok(!overlaps(r, ch), `${JSON.stringify(o)}: ${JSON.stringify(ch)} is cut off (${JSON.stringify(r)})`);
  }
});

test('a painting to the edges, a dark one, one with seals and bright colours near its edge: nothing cut', () => {
  for (const color of ['#0E0E12', '#C9B27C', '#2B4A6F']) {
    const c = testCanvas(800, 600, { color, band: { from: 0.05, to: 0.95 } });
    const g = c.getContext('2d');
    // A red seal near the corner and a bright yellow robe: one hue each, not a chart.
    g.fillStyle = '#D0202A';
    g.fillRect(20, 20, 30, 30);
    g.fillStyle = '#F2C200';
    g.fillRect(300, 560, 200, 40);
    assert.deepEqual(chartCrop(api, c as never, 800, 600), { x: 0, y: 0, w: 800, h: 600 }, color);
  }
});
