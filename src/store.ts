/**
 * Today's work on disk: its record and its image, in the plugin's data
 * folder, so a restart (or a museum that is down) doesn't mean another
 * download. One record file, `today.json`, and the image files of the last
 * two works.
 */
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Work } from './types.ts';

export interface State {
  version: 1;
  /** The key of the work kept (see `workKey`). */
  key: string | null;
  work: Work | null;
  /** Its image, a file name in the store. */
  file: string | null;
  /** Long edge of that image. */
  px: number;
  fetchedAt: number;
  /** The key last tried, when, how many times it failed in a row, and when to try again. */
  tryKey: string | null;
  attemptAt: number;
  failures: number;
  retryAt: number;
  /** What providers remember (how many works a query has). */
  memo: Record<string, unknown>;
}

export const emptyState = (): State => ({ version: 1, key: null, work: null, file: null, px: 0, fetchedAt: 0, tryKey: null, attemptAt: 0, failures: 0, retryAt: 0, memo: {} });

export interface Store {
  load(): Promise<State | undefined>;
  save(s: State): Promise<void>;
  /** Writes an image; returns its path. */
  writeImage(name: string, buf: Buffer): Promise<string>;
  path(name: string): string;
  exists(name: string): Promise<boolean>;
  /** Removes the image files not in `keep`. */
  prune(keep: string[]): Promise<void>;
}

const IMAGE = /^work-[\w-]+\.(jpg|png|gif|webp)$/;

export function fileStore(dir: string): Store {
  let memory: State | undefined;
  const record = join(dir, 'today.json');
  const atomic = async (path: string, data: string | Buffer) => {
    await mkdir(dir, { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, path);
  };
  return {
    async load() {
      if (memory) return memory;
      try {
        const s = JSON.parse(await readFile(record, 'utf8')) as State;
        if (s?.version !== 1) return undefined;
        memory = { ...emptyState(), ...s };
        return memory;
      } catch {
        return undefined;
      }
    },
    async save(s) {
      const before = memory;
      memory = s;
      // Nothing but the time of a check changed: no need to rewrite the file.
      if (before && JSON.stringify({ ...before, attemptAt: 0 }) === JSON.stringify({ ...s, attemptAt: 0 })) return;
      await atomic(record, JSON.stringify(s));
    },
    async writeImage(name, buf) {
      const path = join(dir, name);
      await atomic(path, buf);
      return path;
    },
    path: (name) => join(dir, name),
    async exists(name) {
      try {
        return (await stat(join(dir, name))).size > 0;
      } catch {
        return false;
      }
    },
    async prune(keep) {
      let names: string[] = [];
      try {
        names = await readdir(dir);
      } catch {
        return;
      }
      for (const n of names) if (IMAGE.test(n) && !keep.includes(n)) await unlink(join(dir, n)).catch(() => {});
    },
  };
}

/** The same in memory, for the tests. */
export function memoryStore(): Store & { files: Map<string, Buffer>; saves: number } {
  let state: State | undefined;
  const files = new Map<string, Buffer>();
  const s = {
    files,
    saves: 0,
    async load() {
      return state ? structuredClone(state) : undefined;
    },
    async save(x: State) {
      s.saves++;
      state = structuredClone(x);
    },
    async writeImage(name: string, buf: Buffer) {
      files.set(name, buf);
      return `/mem/${name}`;
    },
    path: (name: string) => `/mem/${name}`,
    async exists(name: string) {
      return files.has(name);
    },
    async prune(keep: string[]) {
      for (const n of [...files.keys()]) if (!keep.includes(n)) files.delete(n);
    },
  };
  return s;
}
