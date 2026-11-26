import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '@kiosko/sdk';
import { fakeNet, fixture, fixtureText } from '../fixtures.ts';
import { imageUrls } from '../image.ts';
import { aic, aicPlan, aicQuery, AIC_USER_AGENT } from './aic/index.ts';
import { parseAicArtwork, parseAicSearch } from './aic/parse.ts';
import { met, metSearchUrl } from './met/index.ts';
import { parseMetObject, parseMetSearch } from './met/parse.ts';
import { npm } from './npm/index.ts';
import { chineseNumber, modernReason, NPM_CREDIT, parseNpmManifest, parseNpmSearch } from './npm/parse.ts';
import { Unsuitable, type Memo } from './provider.ts';
import { rijks, RIJKS_PERIODS, rijksRecordUrl } from './rijks/index.ts';
import { parseIiifInfo, parseRijksEdm, parseRijksSearch } from './rijks/parse.ts';

const memo = (): Memo & { m: Record<string, unknown> } => {
  const m: Record<string, unknown> = {};
  return { m, get: <T>(k: string) => m[k] as T, set: (k, v) => void (v === undefined ? delete m[k] : (m[k] = v)) };
};
const NOW = Date.parse('2026-11-26T10:00:00Z');

test('met: the search counts and the object, public domain only', () => {
  assert.deepEqual(parseMetSearch(fixture('met-search-count.json')), { total: 14426, ids: [10028] });
  const w = parseMetObject(fixture('met-object-437300.json'));
  assert.equal(w.title, 'A Cowherd at Valhermeil, Auvers-sur-Oise');
  assert.equal(w.artist, 'Camille Pissarro');
  assert.equal(w.date, '1874');
  assert.equal(w.museum, 'The Met');
  assert.equal(w.license, 'public-domain');
  assert.ok(Math.abs(w.aspect! - 92.1 / 54.9) < 1e-6, 'the shape from its measurements');
  assert.deepEqual(imageUrls(w.image, 480)[0]!.url, 'https://images.metmuseum.org/CRDImages/ep/web-large/DT1556.jpg');
  assert.match(imageUrls(w.image, 1200)[0]!.url, /\/original\/DT1556\.jpg$/);
  assert.equal(imageUrls(w.image, 1200)[1]!.px, 600, 'the small one as a fallback');
  assert.throws(() => parseMetObject(fixture('met-object-not-pd.json')), (e) => e instanceof Unsuitable && /not in the public domain/.test(e.message));
  // The old search is gone: what it answers is no list.
  assert.deepEqual(parseMetSearch(fixture('met-search-v1-retired.json')), { total: 0, ids: [] });
});

test('met: a pick counts once (remembered), then asks for the n-th and its object', async () => {
  const net = fakeNet(({ url }) => {
    if (url.includes('/v1.1/search') && url.includes('offset=0&')) return { total: 2722, objectIDs: [1] };
    if (url.includes('/v1.1/search')) return { total: 2722, objectIDs: [437300] };
    if (url.endsWith('/objects/437300')) return fixture('met-object-437300.json');
    throw new Error(url);
  });
  const m = memo();
  const w = await met.pick('painting', 'seed', 0, { net, memo: m, now: NOW });
  assert.equal(w.id, '437300');
  assert.equal(net.calls.length, 3);
  assert.ok(net.calls[1]!.url.startsWith(metSearchUrl('painting', 0).split('offset=')[0]!));
  await met.pick('painting', 'seed', 1, { net, memo: m, now: NOW + 3_600_000 });
  assert.equal(net.calls.length, 5, 'the count is remembered');
  await met.pick('painting', 'seed', 1, { net, memo: m, now: NOW + 8 * 86_400_000 });
  assert.equal(net.calls.length, 8, 'and asked again after a week');
});

test('aic: search, artwork, the 1,000 limit and how a pick gets past it', async () => {
  const first = parseAicSearch(fixture('aic-search-first.json'));
  assert.equal(first.total, 1936);
  const w = parseAicArtwork(parseAicSearch(fixture('aic-search-417.json')).items[0]!);
  assert.equal(w.title, 'The Adoration of the Magi');
  assert.equal(w.license, 'cc0');
  assert.equal(w.museum, 'Art Institute of Chicago');
  assert.ok(w.image.type === 'iiif' && w.image.base.startsWith('https://www.artic.edu/iiif/2/'));
  // Only the widths its server offers; a long edge of 480 on a landscape work is the 600 width.
  const urls = imageUrls(w.image, 480);
  assert.match(urls[0]!.url, /\/full\/(400|600|843),\/0\/default\.jpg$/);
  assert.match(imageUrls(w.image, 5000)[0]!.url, /\/full\/1686,/, 'never past 1686');
  assert.throws(() => parseAicSearch(fixture('aic-search-too-far.json')), /too many results/);
  assert.throws(() => parseAicArtwork({ id: 1, is_public_domain: false, image_id: 'x' }), Unsuitable);
  assert.deepEqual(aicPlan(10, 1936, 9, 285673), { from: 10, order: 'asc' });
  assert.deepEqual(aicPlan(1900, 1936, 9, 285673), { from: 35, order: 'desc' });
  const mid = aicPlan(2000, 4224, 100, 300100);
  assert.equal(mid.order, 'asc');
  assert.ok(mid.minId! > 100 && mid.minId! < 300100);
  assert.deepEqual(JSON.parse(aicQuery('painting', { from: 5 })).query.bool.filter[0], { term: { is_public_domain: true } });
});

test('aic: a pick posts its query with the AIC-User-Agent header', async () => {
  const net = fakeNet(({ req }) => {
    const body = JSON.parse(req!.body!);
    if (body.sort[0].id === 'desc') return fixture('aic-search-last.json');
    return body.fields.length > 1 ? fixture('aic-search-417.json') : fixture('aic-search-first.json');
  });
  const w = await aic.pick('painting', 's', 0, { net, memo: memo(), now: NOW });
  assert.equal(w.id, '25743');
  for (const c of net.calls) {
    assert.equal(c.req!.method, 'POST');
    assert.equal(c.req!.headers!['AIC-User-Agent'], AIC_USER_AGENT);
  }
  assert.match(AIC_USER_AGENT, /^kiosko-plugin-art\/\d+\.\d+\.\d+ \(\+https:\/\/kioskolcd\.dev; /);
});

test('rijks: search, EDM record (rights checked) and IIIF size', async () => {
  const s = parseRijksSearch(fixture('rijks-search-189x.json'));
  assert.equal(s.total, 45);
  assert.equal(s.ids.length, 45);
  const r = parseRijksEdm(fixture('rijks-edm-200100988.json'));
  assert.equal(r.title, 'Misty Sea');
  assert.equal(r.artist, 'Jan Toorop');
  assert.equal(r.date, '1899');
  assert.equal(r.id, 'SK-C-1726');
  assert.equal(r.license, 'public-domain');
  assert.equal(r.service, 'https://iiif.micr.io/mPymb');
  assert.deepEqual(parseIiifInfo(fixture('rijks-iiif-info-mPymb.json')), { width: 5862, height: 5197 });
  const closed = structuredClone(fixture('rijks-edm-200100988.json')) as Record<string, unknown>;
  closed.edmRights = 'http://rightsstatements.org/vocab/InC/1.0/';
  assert.throws(() => parseRijksEdm(closed), Unsuitable);
  assert.equal(rijksRecordUrl('https://id.rijksmuseum.nl/200100988'), 'https://data.rijksmuseum.nl/200100988?_profile=edm-framed&_mediatype=application/ld%2Bjson');
  assert.ok(RIJKS_PERIODS.painting.includes('165?'));

  const net = fakeNet(({ url }) =>
    url.includes('/search/collection') ? fixture('rijks-search-189x.json') : url.includes('_profile=edm') ? fixture('rijks-edm-200100988.json') : fixture('rijks-iiif-info-mPymb.json'),
  );
  const w = await rijks.pick('painting', 's', 0, { net, memo: memo(), now: NOW });
  assert.equal(w.image.type, 'iiif');
  assert.ok(Math.abs(w.aspect! - 5862 / 5197) < 1e-9);
  assert.equal(imageUrls(w.image, 843)[0]!.url, `https://iiif.micr.io/mPymb/full/843,/0/default.jpg`);
});

test('npm: search page, manifest, CC0 sizes and its attribution', async () => {
  const s = parseNpmSearch(fixtureText('npm-search-34.html'));
  assert.equal(s.pages, 1114);
  assert.equal(s.items.length, 15);
  assert.deepEqual(s.items[0], { id: '3295', dep: 'P', title: '明文徵明溪橋曳杖圖　軸' });
  const w = parseNpmManifest(fixture('npm-manifest-506.json'), '506', 'P');
  assert.equal(w.title, '五代梁荊浩匡廬圖　軸');
  assert.equal(w.license, 'cc-by');
  assert.deepEqual(w.credit, NPM_CREDIT);
  assert.equal(w.chart, true);
  // A hanging scroll: its whole view is 1158×1964, fine; at most a megapixel is asked for.
  const u = imageUrls(w.image, 2048)[0]!;
  const width = Number(/\/full\/(\d+),/.exec(u.url)![1]);
  assert.ok(width * Math.round((width * 1964) / 1158) <= 1_000_000 * 1.01, u.url);
  const modern = structuredClone(fixture('npm-manifest-506.json')) as { metadata: { label: string; value: string }[] };
  modern.metadata[0]!.value = '民國于非闇花蝶　單片';
  assert.throws(() => parseNpmManifest(modern, '1', 'P'), Unsuitable, 'Republic-era works: maybe not public domain abroad');
  assert.match(u.url, /^https:\/\/iiifod\.npm\.gov\.tw\/iiif\/2\/K2A%2FK2A000817N000000000PAA\/full\/\d+,\/0\/default\.jpg$/);

  const net = fakeNet(({ kind, url, req }) => {
    if (kind === 'text') {
      assert.equal(req!.method, 'POST');
      return fixtureText('npm-search-34.html');
    }
    assert.match(url, /GetJson\?cid=\d+&dept=P$/);
    return fixture('npm-manifest-506.json');
  });
  const m = memo();
  await npm.pick('painting', 's', 0, { net, memo: m, now: NOW });
  assert.equal(net.calls.length, 3, 'page count, a page, a manifest');
  assert.equal((m.m['npm:painting'] as { value: number }).value, 1114);
});

test('npm: works of the Republic (from 1912) are left out, however their date is written', () => {
  // Two real records: a 1944 painting (中華民國三十三年), and one whose only clue is its 民國 title.
  assert.throws(() => parseNpmManifest(fixture('npm-manifest-35226.json'), '35226', 'P'), (e) => e instanceof Unsuitable && /1944/.test(e.message));
  assert.throws(() => parseNpmManifest(fixture('npm-manifest-35407.json'), '35407', 'P'), (e) => e instanceof Unsuitable && /Republic/.test(e.message));
  assert.equal(chineseNumber('三十三'), 33);
  assert.equal(chineseNumber('十'), 10);
  assert.equal(chineseNumber('一百零五'), 105);
  assert.equal(chineseNumber('３８'), 38);
  assert.match(modernReason('', '民國三十八年')!, /1949/);
  assert.match(modernReason('中華民國元年')!, /1912/);
  assert.match(modernReason('', '民國38年')!, /1949/);
  assert.match(modernReason('畫竹', '1935')!, /1935/);
  assert.match(modernReason('近代 山水')!, /Republic or later/);
  assert.ok(modernReason('', '', '', '民國吳子深'), 'any field, the author too');
  // Older ones pass: a dynasty, an imperial era, a year before 1912.
  assert.equal(modernReason('明文徵明溪橋曳杖圖　軸', '明世宗嘉靖三十四年（1555）'), null);
  assert.equal(modernReason('清王翬畫山水　冊', '清 乾隆', 'Landscape'), null);
  assert.equal(modernReason('五代梁荊浩匡廬圖　軸', '1911'), null);
});

test('npm: a pick skips recent works by their title on the search page, without asking for them', async () => {
  // Three of its fifteen made recent.
  const page = fixtureText('npm-search-34.html').replace('明文徵明溪橋', '民國于非闇溪橋').replace('明文徵明松陰', '民國于非闇松陰').replace('明文徵明松聲', '民國于非闇松聲');
  const net = fakeNet(({ kind }) => (kind === 'text' ? page : fixture('npm-manifest-506.json')));
  const titles: string[] = [];
  for (let a = 0; a < 20; a++) {
    await npm.pick('painting', `s${a}`, 0, { net, memo: memo(), now: NOW }).then((w) => titles.push(String(w.id)), () => {});
  }
  const asked = net.calls.filter((c) => c.kind === 'json').map((c) => /cid=(\d+)/.exec(c.url)![1]!);
  const recent = parseNpmSearch(page).items.filter((i) => i.title.startsWith('民國')).map((i) => i.id);
  assert.ok(recent.length > 0);
  assert.ok(asked.length > 0);
  for (const id of asked) assert.ok(!recent.includes(id), `asked for recent ${id}`);
});

test('npm: a work whose manifest is not JSON is skipped, not a failed day; the site down is', async () => {
  const net = fakeNet(({ kind, url }) => {
    if (kind === 'text') return fixtureText('npm-search-34.html');
    throw new HttpError('not JSON from digitalarchive.npm.gov.tw', { status: 200, url });
  });
  await assert.rejects(npm.pick('painting', 's', 0, { net, memo: memo(), now: NOW }), Unsuitable);
  const down = fakeNet(({ kind, url }) => {
    if (kind === 'text') return fixtureText('npm-search-34.html');
    throw new HttpError('HTTP 503', { status: 503, url });
  });
  await assert.rejects(npm.pick('painting', 's', 0, { net: down, memo: memo(), now: NOW }), (e) => !(e instanceof Unsuitable));
});
