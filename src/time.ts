/**
 * Days and wall-clock hours in a time zone, whatever the zone of the
 * machine: the work of the day changes at local midnight, and the day the
 * clocks change has 23 or 25 hours.
 */

const formats = new Map<string, Intl.DateTimeFormat>();

function partsFormat(zone: string): Intl.DateTimeFormat {
  let f = formats.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    formats.set(zone, f);
  }
  return f;
}

export function partsOf(ms: number, zone: string): { y: number; m: number; d: number; h: number; min: number } {
  const o: Record<string, number> = {};
  for (const p of partsFormat(zone).formatToParts(ms)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year!, m: o.month!, d: o.day!, h: o.hour! % 24, min: o.minute! };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-11-26`: the local date of an instant. */
export function localDate(ms: number, zone: string): string {
  const p = partsOf(ms, zone);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** The hour on the local wall clock, 0-23. */
export function localHour(ms: number, zone: string): number {
  return partsOf(ms, zone).h;
}

/** The machine's time zone (where Kiosko runs, so where the panel is). */
export function machineZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
