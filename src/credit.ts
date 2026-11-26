/**
 * What is said about the work on screen, in the order it is dropped when
 * short of room (never the credit): the title, "artist, date", and the
 * museum with the licence, or the credit line its terms give.
 */
import type { Localized } from '@kiosko/sdk';
import { LICENSE_LABELS, STALE } from './labels.ts';
import type { ArtData, Text, Work } from './types.ts';

/**
 * A museum text in the reader's language when the museum gives it in
 * several (the National Palace Museum: Chinese, sometimes English), Chinese
 * for any Chinese reader, else English, else the first.
 */
export function textFor(v: Text, locale: string): string {
  if (typeof v === 'string') return v;
  const lang = locale.toLowerCase();
  const zh = Object.keys(v).find((k) => k.toLowerCase().startsWith('zh'));
  if (lang.startsWith('zh') && zh) return v[zh]!;
  const base = lang.split('-')[0]!;
  return v[locale] ?? v[base] ?? v.en ?? Object.values(v)[0] ?? '';
}

export interface Caption {
  title: string;
  /** "Camille Pissarro, 1874"; empty if the museum gives neither. */
  byline: string;
  /** "The Met · Public domain", or the museum's own credit line. */
  credit: string;
}

export function captionOf(work: Work, locale: string, t: (x: Localized) => string, stale = false): Caption {
  const title = textFor(work.title, locale) || '—';
  const byline = [work.artist, work.date].filter(Boolean).join(', ');
  let credit = work.credit ? textFor(work.credit, locale) : `${textFor(work.museum, locale)} · ${t(LICENSE_LABELS[work.license])}`;
  if (stale) credit = `${credit} · ${t(STALE)}`;
  return { title, byline, credit };
}

export const captionOfData = (d: ArtData, locale: string, t: (x: Localized) => string): Caption => captionOf(d.work, locale, t, d.stale);
