/** Every word the plugin paints, in its five languages. Museum data (titles, names, dates) is never translated. */
import type { Localized } from '@kiosko/sdk';
import { L } from './i18n.ts';
import type { Kind, License } from './types.ts';

export const LICENSE_LABELS: Record<License, Localized> = {
  'public-domain': L('Public domain', 'Dominio público', 'Gemeinfrei', '公有领域', '公有領域'),
  cc0: L('CC0', 'CC0', 'CC0', 'CC0', 'CC0'),
  'cc-by': L('CC BY 4.0', 'CC BY 4.0', 'CC BY 4.0', 'CC BY 4.0', 'CC BY 4.0'),
};

export const KIND_LABELS: Record<Kind | 'any', Localized> = {
  painting: L('Paintings', 'Pintura', 'Gemälde', '绘画', '繪畫'),
  photograph: L('Photographs', 'Fotografía', 'Fotografien', '摄影', '攝影'),
  print: L('Prints', 'Grabados', 'Druckgrafik', '版画', '版畫'),
  any: L('Any of them, a different one each day', 'Cualquiera, uno distinto cada día', 'Alles, jeden Tag etwas anderes', '任意，每天不同', '任意，每天不同'),
};

export const AUTO = L(
  'A different museum each day (the National Palace Museum in Traditional Chinese)',
  'Un museo distinto cada día (el Museo del Palacio Nacional en chino tradicional)',
  'Jeden Tag ein anderes Museum (auf traditionellem Chinesisch das Nationale Palastmuseum)',
  '每天换一家博物馆（繁体中文时为台北故宫博物院）',
  '每天換一家博物館（繁體中文時為國立故宮博物院）',
);

export const WAITING = L("Finding today's work…", 'Buscando la obra de hoy…', 'Das Werk des Tages wird gesucht…', '正在寻找今天的作品…', '正在尋找今天的作品…');
export const LOADING = L('Opening the picture…', 'Abriendo la imagen…', 'Bild wird geöffnet…', '正在打开图片…', '正在開啟圖片…');
/** After the credit when the museum couldn't be reached: the work shown is the last one there was. */
export const STALE = L('not updated', 'sin actualizar', 'nicht aktuell', '未更新', '未更新');
/** The demo's stand-in picture: what it is, and that the real ones come from museums. */
export const SAMPLE_TITLE = L('Hills at dawn', 'Colinas al alba', 'Hügel im Morgengrauen', '黎明的山丘', '黎明的山丘');
export const SAMPLE_CREDIT = L("Sample · each day, a museum's work", 'Muestra · cada día, la obra de un museo', 'Beispiel · jeden Tag ein Museumswerk', '示例 · 每天一件博物馆藏品', '範例 · 每天一件博物館藏品');

export const fill = (text: string, values: Record<string, string>): string => text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
