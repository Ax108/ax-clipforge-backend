import {afterEach, describe, expect, it} from '@jest/globals';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {rmSync} from 'node:fs';
import type {AddressInfo} from 'node:net';
import type {Server} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../app.js';
import {loadEnv} from '../config/env.js';
import {cacheDir} from '../lib/cache-files.js';

describe('GET/POST /api/v1/audio', () => {
  let server: Server;
  let tmpRoot: string | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      });
    }
    if (tmpRoot) {
      rmSync(tmpRoot, {recursive: true, force: true});
      tmpRoot = undefined;
    }
  });

  async function listen(extra: Record<string, string> = {}) {
    const env = loadEnv({
      PORT: '0',
      PUBLIC_API_URL: 'http://localhost:5000',
      CORS_ORIGINS: 'http://localhost:5173',
      YTDLP_BIN: 'clipforge-missing-ytdlp',
      ...extra,
    });
    const app = createApp(env);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const addr = server.address() as AddressInfo;
    return `http://127.0.0.1:${String(addr.port)}`;
  }

  it('rejects missing url, video format, crawlers, and missing yt-dlp', async () => {
    const base = await listen();

    const missingUrl = await fetch(`${base}/api/v1/audio`);
    expect(missingUrl.status).toBe(400);

    const videoFormat = await fetch(
      `${base}/api/v1/audio?url=https://www.youtube.com/watch?v=dQw4w9wgGcQ&format=mp4`,
    );
    expect(videoFormat.status).toBe(400);

    const videoJob = await fetch(`${base}/api/v1/audio/jobs`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
        format: 'mp4',
      }),
    });
    expect(videoJob.status).toBe(400);

    const crawler = await fetch(
      `${base}/api/v1/audio?url=https://www.youtube.com/watch?v=dQw4w9wgGcQ`,
      {headers: {'user-agent': 'facebookexternalhit/1.1'}},
    );
    expect(crawler.status).toBe(403);

    const crawlerJob = await fetch(`${base}/api/v1/audio/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Twitterbot/1.0',
      },
      body: JSON.stringify({
        url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
      }),
    });
    expect(crawlerJob.status).toBe(403);

    const noBinary = await fetch(
      `${base}/api/v1/audio?url=https://www.youtube.com/watch?v=dQw4w9wgGcQ`,
    );
    expect(noBinary.status).toBe(503);
    expect(await noBinary.json()).toMatchObject({error: 'unavailable'});
  });

  it('returns 400 for malformed JSON, clip XOR, and invalid audio quality', async () => {
    const base = await listen();

    const malformed = await fetch(`${base}/api/v1/audio`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{"url":',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({error: 'invalid_json'});

    const xorRange = await fetch(
      `${base}/api/v1/audio?url=dQw4w9wgGcQ&start=10`,
    );
    expect(xorRange.status).toBe(400);

    const heightQuality = await fetch(
      `${base}/api/v1/audio?url=dQw4w9wgGcQ&quality=1080p`,
    );
    expect(heightQuality.status).toBe(400);

    const lookalike = await fetch(`${base}/api/v1/audio/jobs`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({url: 'https://notyoutube.com/watch?v=dQw4w9wgGcQ'}),
    });
    expect(lookalike.status).toBe(400);
  });

  it('shares the mp3 cache with /download and /jobs', async () => {
    tmpRoot = await mkdtemp(path.join(tmpdir(), 'clipforge-audio-'));
    const folder = cacheDir(tmpRoot);
    await mkdir(folder, {recursive: true});
    await writeFile(
      path.join(folder, 'dQw4w9wgGcQ_mp3_320kbps_full.mp3'),
      'cached-audio',
    );

    const base = await listen({TMP_DIR: tmpRoot});
    const url = 'https://www.youtube.com/watch?v=dQw4w9wgGcQ';

    const audioGet = await fetch(
      `${base}/api/v1/audio?url=${encodeURIComponent(url)}`,
    );
    expect(audioGet.status).toBe(200);
    expect(audioGet.headers.get('content-type')).toMatch(/audio\/mpeg/);
    expect(audioGet.headers.get('accept-ranges')).toBe('bytes');
    expect(await audioGet.text()).toBe('cached-audio');

    const ranged = await fetch(
      `${base}/api/v1/audio?url=${encodeURIComponent(url)}`,
      {headers: {Range: 'bytes=0-5'}},
    );
    expect(ranged.status).toBe(206);
    expect(await ranged.text()).toBe('cached');

    const downloadGet = await fetch(
      `${base}/api/v1/download?url=${encodeURIComponent(url)}&format=mp3`,
    );
    expect(downloadGet.status).toBe(200);
    expect(await downloadGet.text()).toBe('cached-audio');

    const audioJob = await fetch(`${base}/api/v1/audio/jobs`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({url}),
    });
    expect(audioJob.status).toBe(200);
    const audioBody = (await audioJob.json()) as {
      cached: boolean;
      cacheKey: string;
      id: string;
    };
    expect(audioBody.cached).toBe(true);
    expect(audioBody.cacheKey).toBe('dQw4w9wgGcQ_mp3_320kbps_full');

    const jobsPost = await fetch(`${base}/api/v1/jobs`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({url, format: 'mp3'}),
    });
    expect(jobsPost.status).toBe(200);
    const jobsBody = (await jobsPost.json()) as {cacheKey: string};
    expect(jobsBody.cacheKey).toBe(audioBody.cacheKey);

    const file = await fetch(`${base}/api/v1/jobs/${audioBody.id}/file`);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe('cached-audio');

    const otherFormat = await fetch(
      `${base}/api/v1/audio?url=${encodeURIComponent(url)}&format=m4a`,
    );
    expect(otherFormat.status).toBe(503);
  });
});
