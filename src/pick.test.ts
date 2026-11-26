import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash32, pickIndex, slotOf, workKey } from './pick.ts';
import { resolveKind, resolveProvider } from './source.ts';

const at = (iso: string) => Date.parse(iso);

test('the same work all day, another the next: the key changes at local midnight', () => {
  const zone = 'Europe/Madrid';
  const morning = slotOf(at('2026-11-26T00:00:30+01:00'), zone, 0);
  const night = slotOf(at('2026-11-26T23:59:30+01:00'), zone, 0);
  const next = slotOf(at('2026-11-27T00:00:30+01:00'), zone, 0);
  assert.deepEqual(morning, { date: '2026-11-26', slot: 0 });
  assert.deepEqual(night, morning);
  assert.equal(next.date, '2026-11-27');
  assert.equal(pickIndex(workKey('met', 'painting', morning.date, 0), 2722), pickIndex(workKey('met', 'painting', night.date, 0), 2722));
});

test('across the clock changes (23- and 25-hour days) the day is still cut at local midnight', () => {
  for (const [zone, start, end] of [
    ['Europe/Madrid', '2026-03-29', '2026-10-25'],
    ['America/New_York', '2026-03-08', '2026-11-01'],
  ] as const) {
    for (const date of [start, end]) {
      // Every 10 minutes through the day of the change: the date is that day from its first minute to its last.
      const t0 = Date.parse(`${date}T00:00:00Z`) - 14 * 3_600_000;
      const dates = new Set<string>();
      let changes = 0;
      let prev = '';
      for (let t = t0; t < t0 + 50 * 3_600_000; t += 10 * 60_000) {
        const d = slotOf(t, zone, 0).date;
        if (prev && d !== prev) {
          changes++;
          // The change is at local midnight: 00:00-00:09 on the new day.
          const local = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
          assert.match(local, /^00:0\d$/, `${zone} ${date}: changed at ${local}`);
        }
        prev = d;
        dates.add(d);
      }
      assert.ok(changes >= 2, `${zone} ${date}`);
    }
  }
});

test('the same instant is a different day in Taipei and in Los Angeles; each changes at its own midnight', () => {
  const t = at('2026-11-26T20:00:00Z');
  assert.equal(slotOf(t, 'Asia/Taipei', 0).date, '2026-11-27');
  assert.equal(slotOf(t, 'America/Los_Angeles', 0).date, '2026-11-26');
});

test('rotating every N hours: slots by the wall clock, also on a 25-hour day', () => {
  const zone = 'Europe/Madrid';
  assert.equal(slotOf(at('2026-11-26T05:59:00+01:00'), zone, 6).slot, 0);
  assert.equal(slotOf(at('2026-11-26T06:00:00+01:00'), zone, 6).slot, 1);
  assert.equal(slotOf(at('2026-11-26T23:00:00+01:00'), zone, 6).slot, 3);
  // 25 October 2026: 02:00-03:00 happens twice; both times it is in the first 3-hour slot.
  assert.equal(slotOf(at('2026-10-25T02:30:00+02:00'), zone, 3).slot, 0);
  assert.equal(slotOf(at('2026-10-25T02:30:00+01:00'), zone, 3).slot, 0);
  assert.equal(slotOf(at('2026-10-25T03:30:00+01:00'), zone, 3).slot, 1);
  assert.equal(slotOf(at('2026-11-26T12:00:00+01:00'), zone, 0).slot, 0, '0: once a day');
});

test('picks are spread: a year of days hits many different indices', () => {
  const seen = new Set<number>();
  for (let d = 0; d < 365; d++) seen.add(pickIndex(`met|painting|day${d}|0`, 2722));
  assert.ok(seen.size > 330, `${seen.size}`);
  assert.notEqual(pickIndex('x', 1000, 0), pickIndex('x', 1000, 1), 'the next attempt is another candidate');
  assert.equal(hash32('a'), hash32('a'));
});

test('auto: the National Palace Museum in Traditional Chinese, the others in turns', () => {
  assert.equal(resolveProvider('auto', 'zh-Hant', '2026-11-26'), 'npm');
  assert.equal(resolveProvider('auto', 'zh-TW', '2026-11-26'), 'npm');
  const others = new Set(Array.from({ length: 30 }, (_, i) => resolveProvider('auto', 'en', `2026-11-${String(i + 1).padStart(2, '0')}`)));
  assert.deepEqual([...others].sort(), ['aic', 'met', 'rijks']);
  assert.equal(resolveProvider('rijks', 'zh-Hant', '2026-11-26'), 'rijks', 'a museum chosen stays');
  assert.equal(resolveKind('photograph', 'npm', '2026-11-26', 0), 'painting', 'paintings only there');
  assert.equal(resolveKind('print', 'met', '2026-11-26', 0), 'print');
});
