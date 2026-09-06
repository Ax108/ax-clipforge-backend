import {afterEach, describe, expect, it} from '@jest/globals';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {rmSync} from 'node:fs';
import {loadEnv} from '../config/env.js';
import {cacheDir} from '../lib/cache-files.js';
import {cacheKeyFor} from '../lib/cache-key.js';
import {JobService} from '../services/job.service.js';
import {YtDlpService} from '../services/ytdlp.service.js';
import {MemoryJobStore} from '../store/memory-job-store.js';

describe('JobService cache hit', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, {recursive: true, force: true});
    dir = undefined;
  });

  it('serves the same full extract without calling yt-dlp', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'clipforge-job-'));
    const env = loadEnv({
      TMP_DIR: dir,
      YTDLP_BIN: 'clipforge-missing-ytdlp',
    });
    const req = {
      url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
      format: 'mp4' as const,
      quality: '480p',
    };
    const key = cacheKeyFor(req);
    expect(key).toBeTruthy();
    const folder = cacheDir(dir);
    await mkdir(folder, {recursive: true});
    await writeFile(path.join(folder, `${key}.mp4`), 'cached');

    const jobs = new JobService(
      env,
      new YtDlpService(env),
      new MemoryJobStore(),
    );
    const job = await jobs.start(req);
    expect(job.cached).toBe(true);
    expect(job.stage).toBe('complete');
    expect(job.filePath).toContain(key);
  });

  it('does not treat a DASH fragment as a completed cache hit', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'clipforge-job-frag-'));
    const env = loadEnv({
      TMP_DIR: dir,
      YTDLP_BIN: 'clipforge-missing-ytdlp',
    });
    const req = {
      url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
      format: 'mp4' as const,
      quality: '1080p',
    };
    const key = cacheKeyFor(req);
    expect(key).toBeTruthy();
    const folder = cacheDir(dir);
    await mkdir(folder, {recursive: true});
    await writeFile(path.join(folder, `${key}.f137.mp4`), 'video-only');

    const jobs = new JobService(
      env,
      new YtDlpService(env),
      new MemoryJobStore(),
    );
    await expect(jobs.start(req)).rejects.toMatchObject({code: 'unavailable'});
  });

  it('joins concurrent identical requests onto one extract', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'clipforge-job-race-'));
    const env = loadEnv({TMP_DIR: dir});
    const req = {
      url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
      format: 'mp4' as const,
      quality: '480p',
    };
    let downloads = 0;
    const ytdlp = {
      isAvailable: async () => true,
      downloadToFile: async () => {
        downloads += 1;
        await new Promise(resolve => {
          setTimeout(resolve, 40);
        });
        return {
          filePath: path.join(dir ?? '', 'out.mp4'),
          filename: 'out.mp4',
          cacheKey: cacheKeyFor(req) ?? 'key',
        };
      },
    };
    const store = new MemoryJobStore();
    const jobs = new JobService(env, ytdlp as unknown as YtDlpService, store);
    const [a, b] = await Promise.all([jobs.start(req), jobs.start(req)]);
    expect(a.id).toBe(b.id);
    expect(await store.inFlightId(cacheKeyFor(req) ?? '')).toBe(a.id);
    expect(await store.get(a.id)).not.toBeNull();
    const unique = new Set([a.id, b.id]);
    expect(unique.size).toBe(1);
    await Promise.all([jobs.waitUntilDone(a.id), jobs.waitUntilDone(b.id)]);
    expect(downloads).toBe(1);
    expect(await store.inFlightId(cacheKeyFor(req) ?? '')).toBeNull();
    await store.close();
  });

  it('does not keep a queued record when yt-dlp is missing after claim', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'clipforge-job-unavail-'));
    const env = loadEnv({
      TMP_DIR: dir,
      YTDLP_BIN: 'clipforge-missing-ytdlp',
    });
    const req = {
      url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
      format: 'mp4' as const,
      quality: '480p',
    };
    const store = new MemoryJobStore();
    let claimedId = '';
    const orig = store.beginJob.bind(store);
    store.beginJob = async job => {
      const result = await orig(job);
      if (result.kind === 'started') claimedId = job.id;
      return result;
    };
    const jobs = new JobService(env, new YtDlpService(env), store);
    await expect(jobs.start(req)).rejects.toMatchObject({code: 'unavailable'});
    expect(claimedId).not.toBe('');
    expect(await store.get(claimedId)).toBeNull();
    expect(await store.inFlightId(cacheKeyFor(req) ?? '')).toBeNull();
    await store.close();
  });
});
