/** Every museum the plugin knows. Add a new one here. */
import type { ArtProvider } from './provider.ts';
import { aic } from './aic/index.ts';
import { met } from './met/index.ts';
import { npm } from './npm/index.ts';
import { rijks } from './rijks/index.ts';

export const PROVIDERS = { met, aic, rijks, npm } satisfies Record<string, ArtProvider>;
export type ProviderId = keyof typeof PROVIDERS;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
/** Those `auto` takes turns with, a different one each day (the National Palace Museum is `auto` for Traditional Chinese). */
export const ROTATION: ProviderId[] = ['met', 'aic', 'rijks'];

export const providerOf = (id: string): ArtProvider => PROVIDERS[id as ProviderId] ?? PROVIDERS.met;
