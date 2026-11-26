/** For the tests: saved answers of the museums' APIs (see fixtures/README.md), a fake network and made-up images. */
import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import type { Net, Req } from './net.ts';

export const fixtureText = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
export const fixture = (name: string): unknown => JSON.parse(fixtureText(name));

export interface Call {
  kind: 'json' | 'text' | 'bytes';
  url: string;
  req?: Req;
}

/** A network that answers from `route` (throw in it to fail) and records every call. */
export function fakeNet(route: (call: Call) => unknown): Net & { calls: Call[] } {
  const calls: Call[] = [];
  const go = async (call: Call) => {
    calls.push(call);
    return route(call);
  };
  return {
    calls,
    json: async <T>(url: string, req?: Req) => (await go({ kind: 'json', url, ...(req ? { req } : {}) })) as T,
    text: async (url, req) => (await go({ kind: 'text', url, ...(req ? { req } : {}) })) as string,
    bytes: async (url, req) => (await go({ kind: 'bytes', url, ...(req ? { req } : {}) })) as Buffer,
  };
}

/** A made-up picture: a flat colour with, optionally, a band of busy texture where `band` says (fractions of the height or width). */
export function testCanvas(w: number, h: number, o: { band?: { from: number; to: number; axis?: 'y' | 'x' }; color?: string } = {}) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = o.color ?? '#7A8C99';
  g.fillRect(0, 0, w, h);
  if (o.band) {
    const { from, to, axis = 'y' } = o.band;
    for (let i = 0; i < 400; i++) {
      // Deterministic "noise": small squares of contrasting colours.
      const a = (i * 0.618034) % 1, b = (i * 0.414214) % 1;
      const x = axis === 'y' ? a * w : (from + (to - from) * a) * w;
      const y = axis === 'y' ? (from + (to - from) * b) * h : b * h;
      g.fillStyle = i % 3 === 0 ? '#F4E04D' : i % 3 === 1 ? '#1B1B1E' : '#D7263D';
      g.fillRect(x, y, Math.max(2, w / 60), Math.max(2, h / 60));
    }
  }
  return c;
}

export const testJpeg = (w: number, h: number): Buffer => testCanvas(w, h).toBuffer('image/jpeg');
export const testPng = (w: number, h: number): Buffer => testCanvas(w, h).toBuffer('image/png');
