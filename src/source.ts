/**
 * The `art/today` source: the work of the day (or of this part of the day,
 * when rotating) from the museum chosen, kept on disk with its image. Read
 * every few minutes, it touches the network only when the work changes.
 */
import { defineSource, t } from '@kiosko/sdk';
import { demoArt } from './demo.ts';
import { L } from './i18n.ts';
import { AUTO, KIND_LABELS } from './labels.ts';
import { createNet } from './net.ts';
import { hash32, slotOf } from './pick.ts';
import { PROVIDER_IDS, PROVIDERS, providerOf, ROTATION } from './providers/index.ts';
import { wantedPx } from './sizes.ts';
import { fileStore, type Store } from './store.ts';
import { machineZone } from './time.ts';
import { readToday } from './today.ts';
import { KINDS, type ArtData, type Kind } from './types.ts';

export { VERSION } from './net.ts';

export const sourceOptions = t.object({
  provider: t.enum(['auto', ...PROVIDER_IDS] as const, {
    default: 'auto',
    label: L('Museum', 'Museo', 'Museum', '博物馆', '博物館'),
    help: L(
      'Whose collection. All of them without a key; only public-domain and CC0 works are shown.',
      'De qué colección. Todos sin clave; solo se muestran obras de dominio público o CC0.',
      'Aus welcher Sammlung. Alle ohne Schlüssel; nur gemeinfreie und CC0-Werke werden gezeigt.',
      '来自哪家博物馆的馆藏。均无需密钥；只显示公有领域和 CC0 作品。',
      '來自哪家博物館的館藏。皆無需金鑰；只顯示公有領域和 CC0 作品。',
    ),
    labels: { auto: AUTO, ...Object.fromEntries(PROVIDER_IDS.map((id) => [id, PROVIDERS[id].name])) },
  }),
  kind: t.enum(['painting', 'photograph', 'print', 'any'] as const, {
    default: 'painting',
    label: L('What', 'Qué', 'Was', '类型', '類型'),
    help: L(
      'The National Palace Museum has paintings only.',
      'El Museo del Palacio Nacional solo tiene pintura.',
      'Das Nationale Palastmuseum hat nur Gemälde.',
      '台北故宫博物院只提供绘画。',
      '國立故宮博物院只提供繪畫。',
    ),
    labels: KIND_LABELS,
  }),
  rotateMs: t.duration({
    default: 0,
    min: 0,
    max: 12 * 3_600_000,
    label: L('A new work every', 'Una obra nueva cada', 'Ein neues Werk alle', '每隔多久换一件', '每隔多久換一件'),
    help: L(
      '0: one a day, changing at midnight. 6 h: four a day (at 0:00, 6:00, 12:00 and 18:00). Whole hours.',
      '0: una al día, cambia a medianoche. 6 h: cuatro al día (a las 0:00, 6:00, 12:00 y 18:00). En horas enteras.',
      '0: eines pro Tag, Wechsel um Mitternacht. 6 h: vier am Tag (um 0:00, 6:00, 12:00 und 18:00). In ganzen Stunden.',
      '0：每天一件，午夜更换。6 小时：每天四件（0:00、6:00、12:00 和 18:00）。以整小时计。',
      '0：每天一件，午夜更換。6 小時：每天四件（0:00、6:00、12:00 和 18:00）。以整小時計。',
    ),
  }),
});

type Options = { provider: 'auto' | (typeof PROVIDER_IDS)[number]; kind: Kind | 'any'; rotateMs: number };

/** The museum for the options and the reader: `auto` is the National Palace Museum in Traditional Chinese, else one of the others by the day. */
export function resolveProvider(option: string, locale: string, date: string): string {
  if (option !== 'auto') return providerOf(option).id;
  if (/^zh-(hant|tw|hk|mo)/i.test(locale)) return 'npm';
  return ROTATION[hash32(`provider|${date}`) % ROTATION.length]!;
}

/** The kind to ask for: `any` a different one by the day and slot, among the museum's own. */
export function resolveKind(option: string, providerId: string, date: string, slot: number): Kind {
  const kinds = providerOf(providerId).kinds;
  if (option === 'any') return kinds[hash32(`kind|${date}|${slot}`) % kinds.length]!;
  return kinds.includes(option as Kind) ? (option as Kind) : kinds[0]!;
}

const stores = new Map<string, Store>();
const net = createNet();

export const todaySource = defineSource({
  id: 'today',
  name: L('Work of the day', 'Obra del día', 'Werk des Tages', '每日一作', '每日一作'),
  description: L(
    "A public-domain work from a museum's open collection, the same all day (or for a few hours), changing at midnight. Kept on disk with its image, at the size the panels need: the museum is asked once a day.",
    'Una obra de dominio público de la colección abierta de un museo, la misma todo el día (o unas horas), que cambia a medianoche. Se guarda en disco con su imagen, al tamaño que piden los paneles: al museo se le pregunta una vez al día.',
    'Ein gemeinfreies Werk aus der offenen Sammlung eines Museums, den ganzen Tag dasselbe (oder ein paar Stunden), Wechsel um Mitternacht. Mit seinem Bild in der Größe, die die Panels brauchen, auf der Platte gespeichert: Das Museum wird einmal am Tag gefragt.',
    '博物馆开放馆藏中的一件公有领域作品，全天（或几小时内）不变，午夜更换。作品和图片按面板所需的尺寸保存在磁盘上：每天只向博物馆请求一次。',
    '博物館開放館藏中的一件公有領域作品，全天（或幾小時內）不變，午夜更換。作品和圖片依面板所需的尺寸儲存在磁碟上：每天只向博物館請求一次。',
  ),
  options: sourceOptions,
  // Mostly a read of the record in memory; the network only for a new work.
  intervalMs: 5 * 60_000,
  minIntervalMs: 60_000,
  timeoutMs: 90_000,
  async read(ctx): Promise<ArtData> {
    let store = stores.get(ctx.dataDir);
    if (!store) stores.set(ctx.dataDir, (store = fileStore(ctx.dataDir)));
    const o = ctx.options as Options;
    const zone = machineZone();
    const { date, slot } = slotOf(ctx.now, zone, Math.round(o.rotateMs / 3_600_000));
    const providerId = resolveProvider(o.provider, ctx.locale, date);
    const kind = resolveKind(o.kind, providerId, date, slot);
    return readToday(providerOf(providerId), kind, date, slot, { now: ctx.now, px: wantedPx(ctx.now), signal: ctx.signal, log: (m) => ctx.log(m) }, { net, store });
  },
  demo: ({ now }) => demoArt(now),
});

export { KINDS };
