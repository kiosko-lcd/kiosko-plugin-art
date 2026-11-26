import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import * as kit from '@loksly/lcd-canvas-kit';
import { THEMES, createBaseContext, defaultsOf } from '@kiosko/sdk';
import { renderWidget } from '@kiosko/sdk/testing';
import { demoArt } from './demo.ts';
import { testCanvas } from './fixtures.ts';
import { lookOf, type Picture } from './picture.ts';
import { SOURCE } from './source-id.ts';
import type { ArtData, Work } from './types.ts';
import { MIN_PX, TURN_MS, work } from './widget.ts';
import { NPM_CREDIT, NPM_MUSEUM } from './providers/npm/parse.ts';

const SIZES = [{ w: 480, h: 320 }, { w: 320, h: 320 }, { w: 172, h: 320 }, { w: 320, h: 480 }, { w: 1920, h: 140 }, { w: 800, h: 160 }, { w: 240, h: 70 }, { w: 140, h: 30 }];
const LOCALES = ['en', 'es', 'zh-Hant'];
const T = Date.parse('2026-11-26T12:00:00+01:00');

const met: Work = { provider: 'met', id: '437300', title: 'A Cowherd at Valhermeil, Auvers-sur-Oise', artist: 'Camille Pissarro', date: '1874', museum: 'The Met', license: 'public-domain', url: 'u', image: { type: 'urls', urls: [] } };
const palace: Work = { provider: 'npm', id: 'P506', title: { 'zh-Hant': '五代梁荊浩匡廬圖　軸', en: 'Mount Kuanglu' }, artist: '', date: '', museum: NPM_MUSEUM, license: 'cc-by', credit: NPM_CREDIT, url: 'u', image: { type: 'urls', urls: [] } };

function picture(w: Work, iw = 900, ih = 600): { data: Picture; art: ArtData } {
  const c = testCanvas(iw, ih, { band: { from: 0.3, to: 0.5 } });
  const art: ArtData = { key: `${w.provider}|painting|2026-11-26|0`, work: w, file: '/x.jpg', px: iw, fetchedAt: T, stale: false };
  return { art, data: { key: art.key, work: w, stale: false, img: c as never, w: iw, h: ih, look: lookOf({ createCanvas } as never, c as never, iw, ih) } };
}

/** Paints and returns every text drawn with its size. */
function texts(data: Picture | undefined, art: ArtData, size: { w: number; h: number }, locale: string, now: number) {
  const out: { text: string; size: number }[] = [];
  const spy = { ...kit, drawTracked: (g: never, text: string, x: number, y: number, o: { size: number }) => (out.push({ text, size: o.size }), kit.drawTracked(g, text, x, y, o as never)) };
  const g = createCanvas(size.w, size.h).getContext('2d');
  const theme = THEMES[0]!;
  work.render(g as never, { ...createBaseContext({ now, locale }), options: defaultsOf(work.options as never), data, sources: { [SOURCE]: art }, working: true, box: { x: 0, y: 0, w: size.w, h: size.h }, theme, fonts: theme.fonts, kit: spy, canvas: { createCanvas }, preview: false } as never);
  return out;
}

test('every size and language, demo and real works: no errors, nothing outside the box', () => {
  for (const size of SIZES)
    for (const locale of LOCALES) {
      const demo = renderWidget(work, { size, locale, now: T });
      assert.equal(demo.error, undefined, `demo ${size.w}x${size.h} ${locale}`);
      assert.equal(demo.outside, 0);
      assert.ok(demo.texts.length > 0);
      for (const w of [met, palace])
        for (const [iw, ih] of [[900, 600], [500, 900]] as const) {
          const { data, art } = picture(w, iw, ih);
          const r = renderWidget(work, { size, locale, now: T, data, sources: { [SOURCE]: art } });
          assert.equal(r.error, undefined, `${w.provider} ${size.w}x${size.h} ${locale}`);
          assert.equal(r.outside, 0, `${w.provider} ${size.w}x${size.h} ${locale}`);
        }
    }
});

test('nothing under 11 px, anywhere', () => {
  for (const size of SIZES)
    for (const locale of LOCALES)
      for (const w of [met, palace]) {
        const { data, art } = picture(w);
        for (const now of [T, T + TURN_MS]) {
          const small = texts(data, art, size, locale, now).filter((x) => x.size < MIN_PX);
          assert.deepEqual(small, [], `${size.w}x${size.h} ${locale}`);
        }
        const demo = texts(undefined, demoArt(T), size, locale, T).filter((x) => x.size < MIN_PX);
        assert.deepEqual(demo, []);
      }
});

test('the credit is always on screen: all at once where it fits, else within a few turns', () => {
  for (const size of SIZES)
    for (const locale of LOCALES)
      for (const w of [met, palace]) {
        const { data, art } = picture(w);
        const shown = [0, 1, 2, 3, 4, 5].flatMap((k) => texts(data, art, size, locale, T + k * TURN_MS)).map((x) => x.text).join(' ');
        const museum = w === met ? 'The Met' : locale === 'zh-Hant' ? '國立故宮博物院' : 'National Palace Museum';
        assert.ok(shown.includes(museum), `${w.provider} ${size.w}x${size.h} ${locale}: ${shown}`);
        if (w === met) {
          assert.ok(/Public domain|Dominio público|公有領域/.test(shown), shown);
          assert.ok(shown.includes('Camille Pissarro') || shown.includes('Camille Pi'), shown);
        } else assert.ok(shown.includes('CC BY 4.0'), shown);
      }
});

test('in Spanish the labels are Spanish, the museum data as the museum gives it', () => {
  const { data, art } = picture(met);
  const r = renderWidget(work, { size: { w: 480, h: 320 }, locale: 'es', now: T, data, sources: { [SOURCE]: art } });
  assert.ok(r.texts.includes('The Met · Dominio público'), r.texts.join(' | '));
  assert.ok(r.texts.some((t) => t.startsWith('A Cowherd')));
  const zh = renderWidget(work, { size: { w: 480, h: 320 }, locale: 'zh-Hant', now: T, ...(() => { const p = picture(palace); return { data: p.data, sources: { [SOURCE]: p.art } }; })() });
  assert.ok(zh.texts.some((t) => t.startsWith('五代梁荊浩')), zh.texts.join(' | '));
  const en = renderWidget(work, { size: { w: 480, h: 320 }, locale: 'en', now: T, ...(() => { const p = picture(palace); return { data: p.data, sources: { [SOURCE]: p.art } }; })() });
  assert.ok(en.texts.some((t) => t.startsWith('Mount Kuanglu')), 'its English title where the museum gives one');
});

test('stale: said after the credit; before any data: a waiting line', () => {
  const { data, art } = picture(met);
  const r = renderWidget(work, { size: { w: 800, h: 300 }, locale: 'en', now: T, data: { ...data, stale: true }, sources: { [SOURCE]: { ...art, stale: true } } });
  assert.ok(r.texts.some((t) => t.includes('not updated')), r.texts.join(' | '));
  const none = renderWidget(work, { size: { w: 320, h: 200 }, locale: 'en', demo: false, data: undefined, sources: {} });
  assert.deepEqual(none.texts, ["Finding today's work…"]);
});
