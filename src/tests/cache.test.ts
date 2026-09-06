import {describe, expect, it} from '@jest/globals';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {rmSync} from 'node:fs';
import {parseByteRange} from '../lib/range.js';
import {cacheKeyFor, clipRangeKey} from '../lib/cache-key.js';
import {findCacheFile, isCompletedCacheName} from '../lib/cache-files.js';
import {parseYtDlpLine} from '../lib/progress.js';

describe('clipRangeKey / cacheKeyFor', () => {
  it('treats missing or 0-0 bounds as full', () => {
    expect(clipRangeKey(undefined, undefined)).toBe('full');
    expect(clipRangeKey(0, 0)).toBe('full');
    expect(clipRangeKey(0, 30)).toBe('0-30');
  });

  it('does not map invalid ranges onto full', () => {
    expect(clipRangeKey(10, 5)).toBeNull();
    expect(clipRangeKey(10, undefined)).toBeNull();
    expect(clipRangeKey(undefined, 10)).toBeNull();
  });

  it('keeps floored second bounds distinct from other integer clips', () => {
    expect(clipRangeKey(0, 30)).toBe('0-30');
    expect(clipRangeKey(1, 31)).toBe('1-31');
    expect(
      cacheKeyFor({
        url: 'dQw4w9wgGcQ',
        format: 'mp4',
        quality: '720p',
        start: 0,
        end: 30,
      }),
    ).not.toBe(
      cacheKeyFor({
        url: 'dQw4w9wgGcQ',
        format: 'mp4',
        quality: '1080p',
        start: 0,
        end: 30,
      }),
    );
  });

  it('is stable for the same video, format, quality, and clip', () => {
    const req = {
      url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
      format: 'mp4' as const,
      quality: '480p',
      start: 0,
      end: 30,
    };
    expect(cacheKeyFor(req)).toBe('dQw4w9wgGcQ_mp4_480p_0-30');
    expect(cacheKeyFor({...req, url: 'dQw4w9wgGcQ'})).toBe(
      'dQw4w9wgGcQ_mp4_480p_0-30',
    );
    expect(
      cacheKeyFor({
        url: 'https://youtu.be/dQw4w9wgGcQ',
        format: 'mp4',
        quality: '480p',
      }),
    ).toBe('dQw4w9wgGcQ_mp4_480p_full');
  });
});

describe('isCompletedCacheName / findCacheFile', () => {
  it('accepts `{key}.{ext}` only for the requested format', () => {
    const key = 'dQw4w9wgGcQ_mp4_1080p_full';
    expect(isCompletedCacheName(`${key}.mp4`, key, 'mp4')).toBe(true);
    expect(isCompletedCacheName(`${key}.webm`, key, 'mp4')).toBe(false);
    expect(isCompletedCacheName(`${key}.f137.mp4`, key, 'mp4')).toBe(false);
    expect(isCompletedCacheName(`${key}.mp4.part`, key, 'mp4')).toBe(false);
    expect(isCompletedCacheName(`${key}.info.json`, key, 'mp4')).toBe(false);
    expect(isCompletedCacheName(key, key, 'mp4')).toBe(false);
  });

  it('does not treat a leftover fragment as a cache hit', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'clipforge-cache-'));
    try {
      const folder = path.join(dir, 'cache');
      await mkdir(folder, {recursive: true});
      const key = 'dQw4w9wgGcQ_mp4_1080p_full';
      await writeFile(path.join(folder, `${key}.f137.mp4`), 'video-only');
      expect(await findCacheFile(folder, key, 'mp4')).toBeNull();
      await writeFile(path.join(folder, `${key}.mp4`), 'merged');
      const hit = await findCacheFile(folder, key, 'mp4');
      expect(hit).toBe(path.join(folder, `${key}.mp4`));
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('does not serve a leftover webm as a completed mp3', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'clipforge-cache-audio-'));
    try {
      const folder = path.join(dir, 'cache');
      await mkdir(folder, {recursive: true});
      const key = 'dQw4w9wgGcQ_mp3_320kbps_full';
      await writeFile(path.join(folder, `${key}.webm`), 'not-mp3');
      expect(await findCacheFile(folder, key, 'mp3')).toBeNull();
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('parseYtDlpLine', () => {
  it('reads download percent, speed, and ETA from yt-dlp', () => {
    const parsed = parseYtDlpLine(
      '[download]  12.3% of  10.50MiB at  1.20MiB/s ETA 00:08',
    );
    expect(parsed).toMatchObject({
      stage: 'downloading',
      percent: 12.3,
      speed: '1.20MiB/s',
      eta: '00:08',
    });
  });

  it('maps merger and extract-audio lines to merging', () => {
    expect(parseYtDlpLine('[Merger] Merging formats into "a.mp4"')?.stage).toBe(
      'merging',
    );
    expect(parseYtDlpLine('[ExtractAudio] Destination: a.mp3')?.stage).toBe(
      'merging',
    );
  });
});

describe('parseByteRange', () => {
  it('supports open end, closed range, and suffix', () => {
    expect(parseByteRange(undefined, 1000)).toBe('all');
    expect(parseByteRange('bytes=0-99', 1000)).toEqual({start: 0, end: 99});
    expect(parseByteRange('bytes=500-', 1000)).toEqual({start: 500, end: 999});
    expect(parseByteRange('bytes=-100', 1000)).toEqual({start: 900, end: 999});
    expect(parseByteRange('bytes=1000-2000', 1000)).toBe('unsatisfiable');
  });
});
