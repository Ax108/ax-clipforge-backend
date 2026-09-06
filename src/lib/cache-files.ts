import {readdir, stat, unlink, utimes} from 'node:fs/promises';
import path from 'node:path';

export function cacheDir(tmpDir: string): string {
  return path.join(tmpDir, 'cache');
}

/** Completed output is exactly `{key}.{ext}` for the requested format. */
export function isCompletedCacheName(
  name: string,
  key: string,
  ext: string,
): boolean {
  if (!key || !ext) return false;
  return name === `${key}.${ext}`;
}

export async function findCacheFile(
  dir: string,
  key: string,
  ext: string,
): Promise<string | null> {
  if (!isCompletedCacheName(`${key}.${ext}`, key, ext)) return null;
  const full = path.join(dir, `${key}.${ext}`);
  try {
    const info = await stat(full);
    if (info.isFile() && info.size > 0) return full;
  } catch {
    /* missing */
  }
  return null;
}

export async function touchFile(filePath: string): Promise<void> {
  const now = new Date();
  try {
    await utimes(filePath, now, now);
  } catch {
    /* missing */
  }
}

/** Drop .part leftovers older than maxAgeMs. In-flight extracts keep recent parts. */
export async function sweepPartFiles(
  dir: string,
  maxAgeMs: number,
): Promise<number> {
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  const now = Date.now();
  let removed = 0;
  for (const name of names) {
    if (!name.endsWith('.part') && !name.endsWith('.ytdl')) continue;
    const full = path.join(dir, name);
    try {
      const info = await stat(full);
      if (now - info.mtimeMs <= maxAgeMs) continue;
      await unlink(full);
      removed += 1;
    } catch {
      /* skip */
    }
  }
  return removed;
}

/** LRU/TTL eviction of completed cache media. Never used when KEEP_TMP is true. */
export async function evictCache(
  dir: string,
  opts: {maxAgeMs: number; maxBytes: number},
): Promise<number> {
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  const now = Date.now();
  const files: {name: string; full: string; mtimeMs: number; size: number}[] =
    [];
  for (const name of names) {
    if (name.endsWith('.part') || name.endsWith('.ytdl')) continue;
    const full = path.join(dir, name);
    try {
      const info = await stat(full);
      if (!info.isFile()) continue;
      files.push({name, full, mtimeMs: info.mtimeMs, size: info.size});
    } catch {
      /* skip */
    }
  }

  files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  let removed = 0;
  let total = files.reduce((sum, file) => sum + file.size, 0);

  for (const file of files) {
    const stale = now - file.mtimeMs > opts.maxAgeMs;
    const over = total > opts.maxBytes;
    if (!stale && !over) break;
    try {
      await unlink(file.full);
      total -= file.size;
      removed += 1;
    } catch {
      /* skip */
    }
  }
  return removed;
}
