import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createBaseContext, themeById, validate } from '@kiosko/sdk';
import { demoArt } from './demo.ts';
import { kenBurns, show } from './interlude.ts';
import { SOURCE } from './source-id.ts';

async function play(width: number, height: number, sources: Record<string, unknown>, options: Record<string, unknown> = {}) {
  const base = createBaseContext({ now: Date.parse('2026-11-26T12:00:00Z'), locale: 'es' });
  return show.prepare({ ...base, options: validate(show.options!, options).value as never, width, height, seed: 1, theme: themeById('midnight'), canvas: { createCanvas, loadImage } as never, sources });
}

test('plays the work full screen for the seconds asked, at every panel shape, quickly', async () => {
  for (const [w, h] of [[480, 320], [1920, 140], [320, 480], [1920, 480]] as const) {
    const p = await play(w, h, { [SOURCE]: demoArt(0) }, { seconds: 10 });
    assert.ok(p);
    assert.equal(p.frames, 120);
    const g = createCanvas(w, h).getContext('2d');
    const t0 = performance.now();
    for (const i of [0, 30, 60, 119]) await p.draw(g as never, i);
    assert.ok((performance.now() - t0) / 4 < 40, 'a frame is cheap');
    const px = g.getImageData(0, 0, w, h).data;
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i]! + px[i + 1]! + px[i + 2]! > 60) lit++;
    assert.ok(lit > (w * h) / 4, 'the picture fills the screen');
  }
});

test('nothing to show yet: skipped', async () => {
  assert.equal(await play(480, 320, {}), null);
});

test('the move stays inside the picture: a zoom on squarish screens, a scan on strips, still without motion', () => {
  const look = { rows: [0, 0, 1, 1, 0, 0], cols: [1, 1, 0, 0, 0, 0] };
  for (const [W, H] of [[480, 320], [1920, 140], [140, 600]] as const)
    for (let t = 0; t <= 1; t += 0.1) {
      const r = kenBurns(1200, 800, W, H, look, t);
      assert.ok(r.x >= -1e-6 && r.y >= -1e-6 && r.x + r.w <= 1200 + 1e-6 && r.y + r.h <= 800 + 1e-6, `${W}x${H} t=${t}: ${JSON.stringify(r)}`);
      assert.ok(Math.abs(r.w / r.h - W / H) < 0.01 * (W / H), 'keeps the screen’s shape');
    }
  const a = kenBurns(1200, 800, 480, 320, look, 0), b = kenBurns(1200, 800, 480, 320, look, 1);
  assert.ok(b.w < a.w, 'zooms in');
  const s0 = kenBurns(1200, 800, 1920, 140, look, 0), s1 = kenBurns(1200, 800, 1920, 140, look, 1);
  assert.equal(s0.y, 0);
  assert.ok(Math.abs(s1.y + s1.h - 800) < 1e-6, 'scans top to bottom');
  assert.deepEqual(kenBurns(1200, 800, 480, 320, look, 0.7, false), kenBurns(1200, 800, 480, 320, look, 0, false));
});
