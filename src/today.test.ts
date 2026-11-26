import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '@kiosko/sdk';
import { fakeNet, testJpeg, type Call } from './fixtures.ts';
import { Unsuitable, type ArtProvider } from './providers/provider.ts';
import { memoryStore } from './store.ts';
import { backoffMs, readToday } from './today.ts';
import type { Work } from './types.ts';

const T = Date.parse('2026-11-26T09:00:00+01:00');

/** A museum whose works are `id`s, with IIIF images of 1600×1000. Throw `fail` to break it. */
function museum(o: { fail?: () => unknown; unsuitable?: number } = {}): ArtProvider & { picks: number } {
  const p = {
    picks: 0,
    id: 'test',
    name: { en: 'Test' },
    hosts: ['x'],
    kinds: ['painting' as const],
    async pick(_k: string, seed: string, attempt: number): Promise<Work> {
      p.picks++;
      if (o.fail) throw o.fail();
      if (attempt < (o.unsuitable ?? 0)) throw new Unsuitable(`not this one (${attempt})`);
      return { provider: 'test', id: `${seed}#${attempt}`, title: 'T', artist: 'A', date: '1900', museum: 'M', license: 'cc0', url: 'u', image: { type: 'iiif', base: 'https://img/x', width: 1600, height: 1000 }, aspect: 1.6 };
    },
  };
  return p as never;
}

const imageNet = (fail?: (c: Call) => unknown) =>
  fakeNet((c) => {
    if (fail) {
      const r = fail(c);
      if (r) throw r;
    }
    const w = Number(/\/full\/(\d+),/.exec(c.url)?.[1] ?? 843);
    return testJpeg(w, Math.round((w * 1000) / 1600));
  });

test('one fetch a day: from disk the rest of it, a new work the next', async () => {
  const store = memoryStore();
  const net = imageNet();
  const m = museum();
  const a = await readToday(m, 'painting', '2026-11-26', 0, { now: T, px: 843 }, { net, store });
  assert.equal(net.calls.length, 1);
  assert.equal(a.px, 843);
  assert.equal(a.stale, false);
  assert.equal(store.files.size, 1);
  for (let h = 1; h < 14; h++) {
    const b = await readToday(m, 'painting', '2026-11-26', 0, { now: T + h * 3_600_000, px: 843 }, { net, store });
    assert.equal(b.work.id, a.work.id);
  }
  assert.equal(net.calls.length, 1, 'no more requests that day');
  assert.equal(m.picks, 1);
  const c = await readToday(m, 'painting', '2026-11-27', 0, { now: T + 86_400_000, px: 843 }, { net, store });
  assert.notEqual(c.work.id, a.work.id);
  assert.equal(net.calls.length, 2);
  assert.equal(store.files.size, 2, "yesterday's image is kept a little");
  await readToday(m, 'painting', '2026-11-28', 0, { now: T + 2 * 86_400_000, px: 843 }, { net, store });
  assert.equal(store.files.size, 2, 'and then removed');
});

test('a bigger panel: one more download, of the image alone, and only if the museum has it bigger', async () => {
  const store = memoryStore();
  const net = imageNet();
  const m = museum();
  await readToday(m, 'painting', '2026-11-26', 0, { now: T, px: 843 }, { net, store });
  const big = await readToday(m, 'painting', '2026-11-26', 0, { now: T + 60_000, px: 1686 }, { net, store });
  assert.equal(big.px, 1600, 'the full size, no more');
  assert.equal(m.picks, 1, 'the work is the same');
  assert.equal(net.calls.length, 2);
  await readToday(m, 'painting', '2026-11-26', 0, { now: T + 120_000, px: 2048 }, { net, store });
  assert.equal(net.calls.length, 2, 'it has no bigger');
});

test('works that do not suit are skipped, in order', async () => {
  const store = memoryStore();
  const m = museum({ unsuitable: 3 });
  const a = await readToday(m, 'painting', '2026-11-26', 0, { now: T, px: 843 }, { net: imageNet(), store });
  assert.match(a.work.id, /#3$/);
  assert.equal(m.picks, 4);
});

test('the museum down: the last work stays (stale), asked again after 5, 10, 20 min… not before', async () => {
  const store = memoryStore();
  let down = false;
  const net = imageNet(() => (down ? new Error('ECONNRESET') : undefined));
  const m = museum();
  await readToday(m, 'painting', '2026-11-26', 0, { now: T, px: 843 }, { net, store });
  down = true;
  const next = T + 86_400_000;
  const s1 = await readToday(m, 'painting', '2026-11-27', 0, { now: next, px: 843 }, { net, store });
  assert.equal(s1.stale, true);
  assert.equal(s1.key.endsWith('2026-11-26|0'), true, "yesterday's");
  const calls = net.calls.length;
  await readToday(m, 'painting', '2026-11-27', 0, { now: next + 4 * 60_000, px: 843 }, { net, store });
  assert.equal(net.calls.length, calls, 'not before 5 minutes');
  await readToday(m, 'painting', '2026-11-27', 0, { now: next + 5 * 60_000, px: 843 }, { net, store });
  assert.ok(net.calls.length > calls);
  assert.equal((await store.load())!.failures, 2);
  assert.equal(backoffMs(2), 10 * 60_000);
  assert.equal(backoffMs(20), 3 * 3_600_000);
  down = false;
  const ok = await readToday(m, 'painting', '2026-11-27', 0, { now: next + 16 * 60_000, px: 843 }, { net, store });
  assert.equal(ok.stale, false);
  assert.equal((await store.load())!.failures, 0);
});

test('a rate limit: waits as long as the museum says', async () => {
  const store = memoryStore();
  const retryAt = T + 2 * 3_600_000;
  const m = museum({ fail: () => new HttpError('HTTP 429', { status: 429, url: 'x', retryAt }) });
  await assert.rejects(readToday(m, 'painting', '2026-11-26', 0, { now: T, px: 843 }, { net: imageNet(), store }));
  assert.equal((await store.load())!.retryAt, retryAt);
  await assert.rejects(readToday(m, 'painting', '2026-11-26', 0, { now: T + 3_600_000, px: 843 }, { net: imageNet(), store }), /trying again at/);
  assert.equal(m.picks, 1);
});

test('an answer that is not an image (a challenge page) is no work', async () => {
  const store = memoryStore();
  const net = fakeNet(() => Buffer.from('<html>Just a moment...</html>'));
  await assert.rejects(readToday(museum(), 'painting', '2026-11-26', 0, { now: T, px: 843 }, { net, store }), /no suitable work/);
});
