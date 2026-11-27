/** The National Palace Museum's open-data search page and IIIF manifests, as plain values. */
import { str, Unsuitable } from '../provider.ts';
import { MAX_ASPECT } from '../../image.ts';
import type { Text, Work } from '../../types.ts';

/** Its open images of up to a megapixel are CC0; bigger ones (up to 6 MP), CC BY 4.0. The plugin asks for the CC0 ones. */
export const NPM_MAX_AREA = 1_000_000;
export const NPM_MUSEUM: Text = { 'zh-Hant': '國立故宮博物院', en: 'National Palace Museum' };
/**
 * The texts of its open-data site are CC BY 4.0, and its terms give the
 * attribution to show, in Chinese or in English, after the work's title.
 */
export const NPM_CREDIT: Text = { 'zh-Hant': '國立故宮博物院，臺北，CC BY 4.0 @ www.npm.gov.tw', en: 'The National Palace Museum, Taipei, CC BY 4.0 @ www.npm.gov.tw' };

/** 〇一二…九十百 (or digits, full-width too) as a number: 三十三 → 33. NaN if it isn't one. */
export function chineseNumber(text: string): number {
  const t = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();
  if (/^\d+$/.test(t)) return Number(t);
  const digit: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let total = 0, cur = 0;
  for (const ch of t) {
    if (ch in digit) cur = digit[ch]!;
    else if (ch === '十') (total += (cur || 1) * 10), (cur = 0);
    else if (ch === '百') (total += (cur || 1) * 100), (cur = 0);
    else return NaN;
  }
  return total + cur;
}

/** The first year of the Republic of China (民國元年). */
export const REPUBLIC = 1912;

/**
 * Why a work of the National Palace Museum may be too recent to be in the
 * public domain everywhere (works of the Republic, from 1912 on, may still
 * be in copyright abroad, at life + 70), or null. From its title and any of
 * its metadata (date, author): a 民國 / 中華民國 / 近代 / 現代 period, a year
 * of the Republic (民國三十三年 = 1944), or a Gregorian year from 1912.
 */
export function modernReason(...texts: string[]): string | null {
  for (const raw of texts) {
    const t = (raw ?? '').trim();
    if (!t) continue;
    const roc = /(?:中華)?民國\s*([0-9０-９]+|[〇零一二兩三四五六七八九十百]+|元)\s*年/.exec(t);
    if (roc) {
      const n = roc[1] === '元' ? 1 : chineseNumber(roc[1]!);
      return `year ${Number.isFinite(n) ? n + 1911 : '?'} (${roc[0]})`;
    }
    if (/^(中華)?民國|^(近|現|当|當)代/.test(t)) return `of the Republic or later: ${t}`;
    if (/民國/.test(t)) return `of the Republic: ${t}`;
    for (const m of t.matchAll(/(?<![0-9０-９])([12][0-9]{3})(?![0-9０-９])/g)) if (Number(m[1]) >= REPUBLIC) return `year ${m[1]}`;
  }
  return null;
}

/**
 * Words for a work's format, written after its title: 軸 hanging scroll, 卷
 * handscroll, 冊 album, 冊頁 album leaf, fans, a single sheet…
 */
const FORMAT = /^(軸|卷|冊|冊頁|手卷|扇面|摺扇|成扇|團扇|紈扇|橫披|單片|貼落|屏|對聯)$/;
/** Words for what holds a work rather than the work: a case, a box. */
const CONTAINER = /^(函|盒|匣|箱|囊|套|書函|錦函|木匣|木盒|畫匣|畫盒)$/;

/**
 * Why a catalogue entry of the National Palace Museum isn't a picture to
 * show, or null. From its title and department alone, so a pick can leave it
 * out before asking for its manifest:
 *
 * - an album as a whole (a title ending in 冊, with no leaf after it): its
 *   leaves are entries of their own (`…　冊　白鵝`), and the album's own views
 *   are its box, covers, endpapers, title pages and colophons;
 * - a set as a whole (`…四屏　軸`, with no `之一` or `（一）` after it): its
 *   parts are entries of their own, and the set's views are its box;
 * - a box or case (函, 匣, 盒…);
 * - the pieces of the curio cabinets (department `U`, as `妙境常新 冊`):
 *   photographed as objects, their first views are a box with a catalogue
 *   label, and which of the next ones are paintings isn't told.
 */
export function notAPicture(title: string, dep: string): string | null {
  if (dep === 'U') return 'a piece of a curio cabinet, photographed in its box';
  const { parts, format, at } = titleParts(title);
  if (parts.some((p) => CONTAINER.test(p))) return 'a box or case';
  // No format word, or something after it (a leaf's or part's name, 之一, （一）): one picture.
  if (!format || at < parts.length - 1) return null;
  if (format === '冊') return 'an album as a whole (its box, covers and colophons; its leaves are entries of their own)';
  if (/[二三四五六七八九十]+[屏條幅]/.test(parts.slice(0, at).join(''))) return 'a set as a whole (its box; its parts are entries of their own)';
  return null;
}

/** A title's words (apart at spaces, ideographic ones too), and its last format word (軸, 卷, 冊…) and where it is. */
function titleParts(title: string): { parts: string[]; format: string; at: number } {
  const parts = title.trim().split(/[\s\u3000]+/).filter(Boolean);
  const at = parts.findLastIndex((p) => FORMAT.test(p));
  return { parts, format: at < 0 ? '' : parts[at]!, at };
}

/** A handscroll (卷), photographed in sections from its start. */
export const isHandscroll = (title: string): boolean => /^(卷|手卷)$/.test(titleParts(title).format);

/**
 * A view's image name ends in the work's number, then three characters for
 * what the view shows (`000` the work, `001`… a leaf, `A01`… the front
 * matter, `B01`… the back matter: title pages and colophons, writing), then
 * the photograph (`PAA`, `PAB`…, on to `PBA`).
 */
const FRONT_OR_BACK = /N\d{6}[A-Z]\d{2}[A-Z]{3,}$/;

/**
 * A page of its open-data search (`/opendata/Pub/Search`, HTML): the works'
 * ids and departments, and how many pages there are.
 */
export function parseNpmSearch(html: string): { pages: number; items: { id: string; dep: string; title: string }[] } {
  const items: { id: string; dep: string; title: string }[] = [];
  const seen = new Set<string>();
  // Each card: `Detail('3295', 'P')`, its title, then the link to `/opendata/Pub/Detail/3295?dep=P`.
  for (const m of html.matchAll(/Detail\('(\d+)',\s*'([A-Z])'\)[\s\S]*?<div class="card-title">([^<]*)<\/div>|\/opendata\/Pub\/Detail\/(\d+)\?dep=([A-Z])/g)) {
    const id = m[1] ?? m[4]!, dep = m[2] ?? m[5]!;
    const key = `${dep}${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ id, dep, title: (m[3] ?? '').trim() });
  }
  const pages = Number(/id="total-pageCount">\s*(\d+)\s*</.exec(html)?.[1] ?? 0);
  return { pages, items };
}

interface Canvas {
  label?: unknown;
  width?: unknown;
  height?: unknown;
  images?: { resource?: { service?: { '@id'?: unknown } } }[];
}

/**
 * A IIIF manifest (`/Integrate/GetJson?cid=…&dept=…`): the work, with the
 * first view of it whose shape suits a panel (a hanging scroll's whole view
 * rather than a long detail; an album's first leaf; a handscroll's section a
 * third of the way in). Entries that aren't a
 * picture (`notAPicture`) and views of the front and back matter are left out.
 */
export function parseNpmManifest(data: unknown, id: string, dep: string): Work {
  const d = (data ?? {}) as { label?: unknown; metadata?: { label?: unknown; value?: unknown }[]; sequences?: { canvases?: Canvas[] }[] };
  const meta = new Map((d.metadata ?? []).map((m) => [str(m.label), str(m.value)]));
  const zh = meta.get('Chinese Title') || str(d.label).replace(/^NPM 故宮 - /, '');
  if (!zh) throw new Unsuitable(`npm ${dep}${id}: no title`);
  const en = meta.get('English Title') ?? '';
  const time = meta.get('Time') ?? '';
  // Works of the Republic (民國, from 1912) may still be in copyright abroad (life + 70): only older ones.
  const modern = modernReason(time, zh, en, ...meta.values());
  if (modern) throw new Unsuitable(`npm ${dep}${id}: ${modern}`);
  const not = notAPicture(zh, dep);
  if (not) throw new Unsuitable(`npm ${dep}${id}: ${not}`);
  const canvases = (d.sequences?.[0]?.canvases ?? [])
    .map((c) => ({ label: str(c.label), w: Number(c.width), h: Number(c.height), service: str(c.images?.[0]?.resource?.service?.['@id']) }))
    .filter((c) => c.w > 0 && c.h > 0 && c.service && !FRONT_OR_BACK.test(c.label))
    // In the order they were photographed (PAA first): some manifests list them backwards, ending with the work rolled up.
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  if (!canvases.length) throw new Unsuitable(`npm ${dep}${id}: no image of the painting`);
  const fits = canvases.filter((c) => Math.max(c.w / c.h, c.h / c.w) <= MAX_ASPECT);
  // A handscroll's first sections are often its silk wrapper, a blank or its title, and its last ones the
  // colophons and its box: a third of the way in is the painting.
  const view = (isHandscroll(zh) ? fits[Math.floor((fits.length - 1) / 3)] : fits[0]) ?? canvases[0]!;
  return {
    provider: 'npm',
    id: `${dep}${id}`,
    // Titles stay as the museum writes them (the painter and dynasty are often part of them).
    title: en ? { 'zh-Hant': zh, en } : zh,
    artist: '',
    date: time,
    museum: NPM_MUSEUM,
    license: 'cc-by',
    credit: NPM_CREDIT,
    url: `https://digitalarchive.npm.gov.tw/opendata/Pub/Detail/${id}?dep=${dep}&mode=full`,
    image: { type: 'iiif', base: view.service, width: view.w, height: view.h, maxArea: NPM_MAX_AREA },
    aspect: view.w / view.h,
    // Its photographs have a colour chart and a label along the bottom.
    chart: true,
  };
}
