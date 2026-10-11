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

describe('JobService file URL', () => {
  it('appends the access token only when CLIPFORGE_TOKEN is set', () => {
    const open = new JobService(
      loadEnv({PUBLIC_API_URL: 'https://temp2.astrax108.com'}),
      new YtDlpService(loadEnv({})),
      new MemoryJobStore(),
    );
    expect(open.fileUrl('job-1')).toBe(
      'https://temp2.astrax108.com/api/v1/jobs/job-1/file',
    );
    const gated = new JobService(
      loadEnv({
        PUBLIC_API_URL: 'https://temp2.astrax108.com',
        CLIPFORGE_TOKEN: 'test-token',
      }),
      new YtDlpService(loadEnv({})),
      new MemoryJobStore(),
    );
    expect(gated.fileUrl('job-1')).toBe(
      'https://temp2.astrax108.com/api/v1/jobs/job-1/file?access_token=test-token',
    );
  });
});

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
      sourceBudget: async () => ({duration: 30, bytes: 1_000}),
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

  it('rejects a clip longer than MAX_CLIP_SECONDS before yt-dlp', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'clipforge-job-clip-'));
    const env = loadEnv({
      TMP_DIR: dir,
      YTDLP_BIN: 'clipforge-missing-ytdlp',
      MAX_CLIP_SECONDS: '60',
    });
    const jobs = new JobService(
      env,
      new YtDlpService(env),
      new MemoryJobStore(),
    );
    await expect(
      jobs.start({
        url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
        format: 'mp4',
        quality: '480p',
        start: 0,
        end: 120,
      }),
    ).rejects.toMatchObject({code: 'clip_too_long'});
  });

  it('rejects a full video over the source cap and drops the queued record', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'clipforge-job-source-'));
    const env = loadEnv({TMP_DIR: dir, MAX_SOURCE_SECONDS: '60'});
    const req = {
      url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
      format: 'mp4' as const,
      quality: '480p',
    };
    const store = new MemoryJobStore();
    const jobs = new JobService(
      env,
      {
        isAvailable: async () => true,
        sourceBudget: async () => ({duration: 120, bytes: 1_000}),
        downloadToFile: async () => {
          throw new Error('should not download');
        },
      } as unknown as YtDlpService,
      store,
    );
    await expect(jobs.start(req)).rejects.toMatchObject({
      code: 'source_too_long',
    });
    expect(await store.inFlightId(cacheKeyFor(req) ?? '')).toBeNull();
    await store.close();
  });

  it('rejects a new extract when free disk is below MIN_FREE_DISK_BYTES', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'clipforge-job-disk-'));
    const env = loadEnv({
      TMP_DIR: dir,
      MIN_FREE_DISK_BYTES: '999999999999999',
    });
    const store = new MemoryJobStore();
    const jobs = new JobService(
      env,
      {
        isAvailable: async () => true,
        sourceBudget: async () => ({duration: 30, bytes: 1_000}),
      } as unknown as YtDlpService,
      store,
    );
    const req = {
      url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
      format: 'mp4' as const,
      quality: '480p',
    };
    await expect(jobs.start(req)).rejects.toMatchObject({code: 'disk_full'});
    expect(await store.inFlightId(cacheKeyFor(req) ?? '')).toBeNull();
    await store.close();
  });

  it('rejects a new extract when MAX_ACTIVE_JOBS is already taken', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'clipforge-job-busy-'));
    const env = loadEnv({TMP_DIR: dir, MAX_ACTIVE_JOBS: '1'});
    let releaseDownload: () => void = () => {};
    const gate = new Promise<void>(resolve => {
      releaseDownload = resolve;
    });
    const ytdlp = {
      isAvailable: async () => true,
      sourceBudget: async () => ({duration: 30, bytes: 1_000}),
      downloadToFile: () =>
        gate.then(() => ({
          filePath: path.join(dir ?? '', 'out.mp4'),
          filename: 'out.mp4',
          cacheKey: 'key',
        })),
    };
    const store = new MemoryJobStore();
    const jobs = new JobService(env, ytdlp as unknown as YtDlpService, store);
    const first = jobs.start({
      url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
      format: 'mp4',
      quality: '480p',
    });
    await first;
    await expect(
      jobs.start({
        url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        format: 'mp4',
        quality: '480p',
      }),
    ).rejects.toMatchObject({code: 'busy'});
    releaseDownload();
    await jobs.waitUntilDone((await first).id);
    await store.close();
  });
});
