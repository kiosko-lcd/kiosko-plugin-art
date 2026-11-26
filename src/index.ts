/**
 * A work of art of the day: a public-domain painting, photograph or print
 * from a great museum's open collection (The Met, the Art Institute of
 * Chicago, the Rijksmuseum, Taiwan's National Palace Museum), fitted to the
 * panel's shape, with its credit always on screen; and as an interlude. No
 * keys; each museum is a module under `providers/`.
 */
import { definePlugin } from '@kiosko/sdk';
import { L, LANGUAGES } from './i18n.ts';
import { show } from './interlude.ts';
import { PROVIDER_IDS, PROVIDERS } from './providers/index.ts';
import { todaySource, VERSION } from './source.ts';
import { work } from './widget.ts';

export { PROVIDERS } from './providers/index.ts';
export { todaySource } from './source.ts';
export { work } from './widget.ts';
export { show } from './interlude.ts';

export default definePlugin({
  id: 'art',
  name: L('A work of art a day', 'Una obra del día', 'Ein Kunstwerk am Tag', '每日一件艺术品', '每日一件藝術品'),
  version: VERSION,
  description: L(
    "A work of art of the day on the panel: a public-domain painting, photograph or print from The Met, the Art Institute of Chicago, the Rijksmuseum or Taiwan's National Palace Museum, fitted to the tile's shape (whole on squarish ones, the most interesting band on long strips), with its title, artist, year, museum and credit always on screen. Also full screen, as an interlude. No keys needed.",
    'Una obra de arte al día en el panel: un cuadro, una fotografía o un grabado de dominio público del Met, el Art Institute of Chicago, el Rijksmuseum o el Museo del Palacio Nacional de Taiwán, encajado a la forma del hueco (entero en los cuadrados, la franja más interesante en las barras largas), con su título, autor, año, museo y crédito siempre en pantalla. También a pantalla completa, como interludio. Sin claves.',
    'Ein Kunstwerk des Tages auf dem Panel: ein gemeinfreies Gemälde, Foto oder Druckwerk aus dem Met, dem Art Institute of Chicago, dem Rijksmuseum oder dem Nationalen Palastmuseum in Taiwan, passend zur Form der Kachel (ganz auf quadratischen, der interessanteste Streifen auf langen Leisten), Titel, Künstler, Jahr, Museum und Nennung immer auf dem Bildschirm. Auch im Vollbild, als Zwischenspiel. Ohne Schlüssel.',
    '在面板上每天欣赏一件艺术品：来自大都会艺术博物馆、芝加哥艺术博物馆、荷兰国家博物馆或台北故宫博物院的公有领域绘画、摄影或版画，按方块形状呈现（方形方块显示完整作品，长条显示最有看点的一段），标题、作者、年代、博物馆和出处始终显示在屏幕上。也可作为全屏过场动画。无需密钥。',
    '在面板上每天欣賞一件藝術品：來自大都會藝術博物館、芝加哥藝術博物館、荷蘭國家博物館或國立故宮博物院的公有領域繪畫、攝影或版畫，依方塊形狀呈現（方形方塊顯示完整作品，長條顯示最有看頭的一段），標題、作者、年代、博物館和出處始終顯示在螢幕上。也可作為全螢幕過場動畫。無需金鑰。',
  ),
  author: 'Loksly',
  license: 'MIT',
  homepage: 'https://github.com/kiosko-lcd/kiosko-plugin-art#readme',
  repository: 'https://github.com/kiosko-lcd/kiosko-plugin-art',
  icon: 'image',
  sdk: '^0.2.0',
  platforms: ['linux', 'darwin', 'win32'],
  languages: LANGUAGES,
  permissions: { network: [...new Set(PROVIDER_IDS.flatMap((id) => PROVIDERS[id].hosts))] },
  resources: { memoryMb: 40, cpu: 'low' },
  widgets: [work],
  sources: [todaySource],
  interludes: [show],
});
