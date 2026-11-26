/**
 * The network, as the providers see it: JSON and text through the SDK's
 * client (its User-Agent, conditional requests and rate-limit pauses), and
 * images as bytes, with the same User-Agent and a size limit. Tests pass a
 * fake one.
 */
import { createHttp, HttpError } from '@kiosko/sdk';

export const VERSION = '0.1.0';
/** What the SDK sends as User-Agent: the plugin, then Kiosko. Never the person. */
export const AGENT = `kiosko-plugin-art/${VERSION}`;
export const USER_AGENT = `${AGENT} Kiosko (+https://kioskolcd.dev)`;

export interface Req {
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  signal?: AbortSignal;
}

export interface Net {
  json<T = unknown>(url: string, req?: Req): Promise<T>;
  text(url: string, req?: Req): Promise<string>;
  /** An image (or any file): at most `maxBytes`. */
  bytes(url: string, req?: Req & { maxBytes?: number }): Promise<Buffer>;
}

/** Bigger than any image this plugin asks for (a Met original is 3 to 20 MB). */
export const MAX_BYTES = 40 * 1024 * 1024;

export function createNet(o: { fetch?: typeof fetch; now?: () => number } = {}): Net {
  const doFetch = o.fetch ?? fetch;
  const http = createHttp({ agent: AGENT, ...(o.fetch ? { fetch: o.fetch } : {}), ...(o.now ? { now: o.now } : {}) });
  const strip = (req: Req = {}) => ({
    ...(req.headers ? { headers: req.headers } : {}),
    ...(req.method ? { method: req.method } : {}),
    ...(req.body !== undefined ? { body: req.body } : {}),
    ...(req.signal ? { signal: req.signal } : {}),
  });
  return {
    async json<T>(url: string, req?: Req) {
      return (await http.json<T>(url, strip(req))).data;
    },
    async text(url: string, req?: Req) {
      return (await http.text(url, strip(req))).data;
    },
    async bytes(url, req = {}) {
      const resting = http.resting(url);
      if (resting) throw new HttpError(`${new URL(url).host} asked to wait`, { status: 429, url, retryAt: resting });
      const res = await doFetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'image/jpeg,image/*;q=0.8', ...req.headers }, redirect: 'follow', ...(req.signal ? { signal: req.signal } : {}) });
      if (!res.ok) throw new HttpError(`HTTP ${res.status} from ${new URL(url).host}`, { status: res.status, url });
      const max = req.maxBytes ?? MAX_BYTES;
      const declared = Number(res.headers.get('content-length'));
      if (declared > max) {
        await res.body?.cancel();
        throw new Error(`${declared} bytes, more than ${max}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > max) throw new Error(`${buf.length} bytes, more than ${max}`);
      return buf;
    },
  };
}
