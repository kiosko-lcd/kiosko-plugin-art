/**
 * For the gallery, the editor and the tests, where there is no network: a
 * stand-in picture drawn here (hills at dawn, in flat bands like a print),
 * captioned as a sample with where the real works come from. Never a
 * museum's image.
 */
import type { CanvasApi, Canvas } from '@kiosko/sdk';
import { SAMPLE_CREDIT, SAMPLE_TITLE } from './labels.ts';
import { lookOf, type Picture } from './picture.ts';
import type { ArtData, Work } from './types.ts';

export const DEMO_W = 480, DEMO_H = 336;

export function demoWork(): Work {
  return {
    provider: 'demo',
    id: 'sample',
    title: { ...(SAMPLE_TITLE as Record<string, string>) },
    artist: 'Kiosko',
    date: '2026',
    museum: 'Kiosko',
    license: 'cc0',
    credit: { ...(SAMPLE_CREDIT as Record<string, string>) },
    url: 'https://kioskolcd.dev',
    image: { type: 'urls', urls: [] },
    aspect: DEMO_W / DEMO_H,
  };
}

export const demoArt = (now: number): ArtData => ({ key: 'demo', work: demoWork(), file: null, px: DEMO_W, fetchedAt: now, stale: false, demo: true });

/** Paints the stand-in on a canvas of `DEMO_W`×`DEMO_H`. */
export function paintSample(canvas: Pick<CanvasApi, 'createCanvas'>): Canvas {
  const c = canvas.createCanvas(DEMO_W, DEMO_H);
  const g = c.getContext('2d');
  const W = DEMO_W, H = DEMO_H;
  const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#2B3A67');
  sky.addColorStop(0.55, '#C86E5A');
  sky.addColorStop(1, '#F2C57C');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // The sun, low.
  g.fillStyle = '#FFE7B3';
  g.beginPath();
  g.arc(W * 0.68, H * 0.5, H * 0.075, 0, Math.PI * 2);
  g.fill();
  // Hills, far to near: each a band of a wave.
  const hills: [number, number, number, string][] = [
    [0.5, 0.05, 1.3, '#8C5A6B'],
    [0.6, 0.06, 2.1, '#5C3F5E'],
    [0.72, 0.05, 3.2, '#3A2E4A'],
    [0.86, 0.04, 4.7, '#1F2236'],
  ];
  hills.forEach(([base, amp, freq, color], k) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) g.lineTo(x, H * (base - amp * Math.sin((x / W) * Math.PI * freq + k * 1.7) - amp * 0.5 * Math.sin((x / W) * Math.PI * freq * 2.3)));
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  });
  // A few birds, for something to crop to.
  g.strokeStyle = '#1F2236';
  g.lineWidth = 2;
  for (const [x, y, s] of [[0.22, 0.2, 9], [0.27, 0.25, 7], [0.31, 0.18, 6]] as const) {
    g.beginPath();
    g.moveTo(W * x - s, H * y);
    g.quadraticCurveTo(W * x - s / 2, H * y - s / 2, W * x, H * y);
    g.quadraticCurveTo(W * x + s / 2, H * y - s / 2, W * x + s, H * y);
    g.stroke();
  }
  return c;
}

let sample: { pic: Omit<Picture, 'key' | 'work' | 'stale'>; with: unknown } | undefined;

/** The stand-in as a picture, painted once with the canvas API at hand. */
export function demoPicture(canvas: Pick<CanvasApi, 'createCanvas'>, art: ArtData = demoArt(0)): Picture {
  if (!sample || sample.with !== canvas.createCanvas) {
    const img = paintSample(canvas);
    sample = { pic: { img, w: DEMO_W, h: DEMO_H, look: lookOf(canvas, img, DEMO_W, DEMO_H) }, with: canvas.createCanvas };
  }
  return { ...sample.pic, key: art.key, work: art.work, stale: false };
}
