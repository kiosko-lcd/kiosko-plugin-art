import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { testJpeg, testPng } from './fixtures.ts';
import { imageDims, imageUrls, stepFor, unsuitable } from './image.ts';

test('image sizes from the header: JPEG, PNG, WebP; not an image: null', () => {
  assert.deepEqual(imageDims(testJpeg(321, 123)), { w: 321, h: 123 });
  assert.deepEqual(imageDims(testPng(40, 77)), { w: 40, h: 77 });
  assert.deepEqual(imageDims(createCanvas(64, 48).toBuffer('image/webp')), { w: 64, h: 48 });
  assert.equal(imageDims(Buffer.from('<html>Just a moment...</html>')), null);
});

test('which URL to ask for: no bigger than needed, a fallback, the CC0 limit', () => {
  const iiif = { type: 'iiif' as const, base: 'https://x/iiif/a', width: 4000, height: 2000 };
  assert.equal(imageUrls(iiif, 1200)[0]!.url, 'https://x/iiif/a/full/1200,/0/default.jpg');
  assert.equal(imageUrls(iiif, 1200)[1]!.url, 'https://x/iiif/a/full/843,/0/default.jpg');
  // A portrait: the long edge is the height.
  const tall = { ...iiif, width: 1000, height: 2000 };
  assert.equal(imageUrls(tall, 1200)[0]!.url, 'https://x/iiif/a/full/600,/0/default.jpg');
  assert.equal(imageUrls(tall, 1200)[0]!.px, 1200);
  // Never past the full size.
  assert.equal(imageUrls({ ...iiif, width: 500, height: 400 }, 2048)[0]!.url, 'https://x/iiif/a/full/500,/0/default.jpg');
  // Within a megapixel.
  const capped = imageUrls({ ...iiif, maxArea: 1_000_000 }, 2048)[0]!;
  assert.equal(capped.url, 'https://x/iiif/a/full/1414,/0/default.jpg');
  assert.equal(stepFor(500), 843);
  assert.equal(stepFor(5000), 2048);
});

test('shapes and sizes that suit a panel', () => {
  assert.equal(unsuitable(1.5), null);
  assert.equal(unsuitable(1 / 3), null);
  assert.match(unsuitable(5)!, /too long/);
  assert.match(unsuitable(0.2)!, /too tall/);
  assert.match(unsuitable(1, { w: 200, h: 200 })!, /too small/);
  assert.equal(unsuitable(undefined), null);
});
