/**
 * The National Palace Museum (國立故宮博物院, Taipei): its open-data site,
 * no key. About 410,000 views of paintings, calligraphy and objects are
 * open: up to a megapixel under CC0, up to 6 MP and the site's texts under
 * CC BY 4.0, "without application, for any use, free of charge", with the
 * attribution its terms give. The plugin asks only for paintings (繪畫), at
 * a megapixel at most, through the site's IIIF service, and always shows that
 * attribution.
 *
 * Its government open-data API (odapi.npm.gov.tw, listed on data.gov.tw) has
 * the same catalogue as JSON but did not answer from outside Taiwan when this
 * was written, so a pick asks the open-data site's own search (one page of
 * 15, as its "Opendata" page does), then the work's IIIF manifest.
 */
import { HttpError } from '@kiosko/sdk';
import { pickIndex } from '../../pick.ts';
import { remembered, Unsuitable, type ArtProvider } from '../provider.ts';
import { modernReason, notAPicture, parseNpmManifest, parseNpmSearch } from './parse.ts';

export const NPM_SEARCH = 'https://digitalarchive.npm.gov.tw/opendata/Pub/Search';
export const npmManifestUrl = (id: string, dep: string): string => `https://digitalarchive.npm.gov.tw/Integrate/GetJson?cid=${encodeURIComponent(id)}&dept=${encodeURIComponent(dep)}`;
/** Its category of paintings. */
export const NPM_PAINTINGS = '繪畫';
export const NPM_PAGE = 15;

/** The search's body, as its page sends it. */
export function npmSearchBody(page: number): string {
  return JSON.stringify({ RegisterType: NPM_PAINTINGS, IndexYear: null, WestBeginYear: 0, WestEndYear: 0, YearDisplay: '', SearchContent: null, RegisterTypeEng: null, PageInfo: { PageIndex: page, PageSize: NPM_PAGE, PageCount: 0 } });
}

export const npm: ArtProvider = {
  id: 'npm',
  name: { en: 'National Palace Museum (Taipei)', es: 'Museo del Palacio Nacional (Taipéi)', de: 'Nationales Palastmuseum (Taipeh)', 'zh-Hans': '台北故宫博物院', 'zh-Hant': '國立故宮博物院' },
  hosts: ['digitalarchive.npm.gov.tw', 'iiifod.npm.gov.tw'],
  kinds: ['painting'],
  async pick(_kind, seed, attempt, ctx) {
    const req = ctx.signal ? { signal: ctx.signal } : {};
    const search = async (page: number) =>
      parseNpmSearch(await ctx.net.text(NPM_SEARCH, { ...req, method: 'POST', body: npmSearchBody(page), headers: { 'Content-Type': 'application/json', Accept: 'text/html' } }));
    const pages = await remembered(ctx.memo, 'npm:painting', ctx.now, async () => (await search(1)).pages);
    if (!pages) throw new Error('npm: no paintings found');
    const page = 1 + pickIndex(seed, pages, attempt);
    const { items } = await search(page);
    if (!items.length) {
      ctx.memo.set('npm:painting', undefined);
      throw new Unsuitable(`npm: nothing on page ${page} of ${pages}`);
    }
    // Recent works (of the Republic, from 1912), whole albums and sets, boxes are left out by their title already here, saving a request.
    const older = items.filter((it) => !modernReason(it.title) && !notAPicture(it.title, it.dep));
    if (!older.length) throw new Unsuitable(`npm: no paintings to show on page ${page}`);
    const item = older[pickIndex(`${seed}|${page}`, older.length, attempt)]!;
    let manifest: unknown;
    try {
      manifest = await ctx.net.json(npmManifestUrl(item.id, item.dep), req);
    } catch (err) {
      // A work without a manifest (an error page instead of JSON, a 404): the next one. Down or rate-limited: give up for now.
      if (err instanceof HttpError && (err.status === 429 || err.status >= 500)) throw err;
      if (err instanceof HttpError) throw new Unsuitable(`npm ${item.dep}${item.id}: no manifest (${err.message})`);
      throw err;
    }
    return parseNpmManifest(manifest, item.id, item.dep);
  },
};
