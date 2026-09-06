import {readdir, rm, stat} from 'node:fs/promises';
import path from 'node:path';

export function isPathInside(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

/** Delete stamp.mp4, stamp.part, and other yt-dlp leftovers for one job. */
export async function removePrefixInDir(
  dir: string,
  prefix: string,
): Promise<void> {
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter(name => name === prefix || name.startsWith(`${prefix}.`))
      .map(name => rm(path.join(dir, name), {force: true, recursive: true})),
  );
}

/** Drop leftover extract files older than maxAgeMs. In-flight jobs keep recent files. */
export async function sweepAgedEntries(
  dir: string,
  maxAgeMs: number,
  consider: (name: string) => boolean,
  remove: (full: string) => Promise<void>,
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
    if (!consider(name)) continue;
    const full = path.join(dir, name);
    try {
      const info = await stat(full);
      if (now - info.mtimeMs <= maxAgeMs) continue;
      await remove(full);
      removed += 1;
    } catch {
      /* skip locked/missing */
    }
  }
  return removed;
}

export async function sweepTmpDir(
  dir: string,
  maxAgeMs: number,
): Promise<number> {
  return sweepAgedEntries(
    dir,
    maxAgeMs,
    () => true,
    full => rm(full, {force: true, recursive: true}),
  );
}
