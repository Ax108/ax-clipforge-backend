import {afterEach, describe, expect, it} from '@jest/globals';
import {mkdtemp, readdir, utimes, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {rmSync} from 'node:fs';
import {isPathInside, removePrefixInDir, sweepTmpDir} from '../lib/tmp.js';

describe('isPathInside', () => {
  it('accepts files under the tmp root and rejects traversal', () => {
    const root = path.join(process.cwd(), 'tmp');
    expect(isPathInside(root, path.join(root, 'clip.mp4'))).toBe(true);
    expect(isPathInside(root, path.join(root, 'nested', 'clip.mp4'))).toBe(
      true,
    );
    expect(isPathInside(root, path.join(root, '..', 'package.json'))).toBe(
      false,
    );
    expect(isPathInside(root, path.parse(root).root)).toBe(false);
  });
});

describe('tmp cleanup', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, {recursive: true, force: true});
    dir = undefined;
  });

  it('removes stamp plus yt-dlp leftovers with the same prefix', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'clipforge-tmp-'));
    const stamp = 'abc123-1';
    await writeFile(path.join(dir, `${stamp}.mp4`), 'ok');
    await writeFile(path.join(dir, `${stamp}.mp4.part`), 'partial');
    await writeFile(path.join(dir, `${stamp}.f251.webm`), 'frag');
    await writeFile(path.join(dir, 'other.mp4'), 'keep');

    await removePrefixInDir(dir, stamp);

    expect(await readdir(dir)).toEqual(['other.mp4']);
  });

  it('sweeps only files older than maxAgeMs', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'clipforge-tmp-'));
    const oldFile = path.join(dir, 'old.mp4');
    const freshFile = path.join(dir, 'fresh.mp4');
    await writeFile(oldFile, 'old');
    await writeFile(freshFile, 'fresh');
    const stale = new Date(Date.now() - 60_000);
    await utimes(oldFile, stale, stale);

    const removed = await sweepTmpDir(dir, 10_000);
    expect(removed).toBe(1);
    expect(await readdir(dir)).toEqual(['fresh.mp4']);
  });

  it('does not throw when the tmp dir is missing', async () => {
    const missing = path.join(
      tmpdir(),
      `clipforge-missing-${String(Date.now())}`,
    );
    await expect(sweepTmpDir(missing, 1000)).resolves.toBe(0);
    await expect(removePrefixInDir(missing, 'stamp')).resolves.toBeUndefined();
  });
});
