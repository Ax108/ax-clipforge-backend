import {afterEach, describe, expect, it} from '@jest/globals';
import type {AddressInfo} from 'node:net';
import type {Server} from 'node:http';
import {createApp} from '../app.js';
import {loadEnv, parseCorsOrigins, parseEnvBool} from '../config/env.js';

describe('parseCorsOrigins', () => {
  it('splits a comma-separated allowlist', () => {
    expect(
      parseCorsOrigins('http://localhost:5173, https://YOUR_APP.vercel.app '),
    ).toEqual(['http://localhost:5173', 'https://YOUR_APP.vercel.app']);
  });
});

describe('parseEnvBool', () => {
  it('treats the string false as false (unlike Boolean())', () => {
    expect(parseEnvBool(undefined, false)).toBe(false);
    expect(parseEnvBool('', true)).toBe(true);
    expect(parseEnvBool('false', true)).toBe(false);
    expect(parseEnvBool('0', true)).toBe(false);
    expect(parseEnvBool('true', false)).toBe(true);
    expect(parseEnvBool('1', false)).toBe(true);
  });
});

describe('loadEnv KEEP_TMP', () => {
  it('defaults true for local bun run dev; Docker sets false', () => {
    expect(loadEnv({}).KEEP_TMP).toBe(true);
    expect(loadEnv({KEEP_TMP: 'true'}).KEEP_TMP).toBe(true);
    expect(loadEnv({KEEP_TMP: 'false'}).KEEP_TMP).toBe(false);
  });
});

describe('API', () => {
  let server: Server;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  });

  async function listen() {
    const env = loadEnv({
      PORT: '0',
      PUBLIC_API_URL: 'http://localhost:5000',
      CORS_ORIGINS: 'http://localhost:5173',
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

  it('GET /api/v1/health reports process presence without requiring yt-dlp', async () => {
    const base = await listen();
    const res = await fetch(`${base}/api/v1/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    const body = (await res.json()) as {
      ok: boolean;
      service: string;
      binaries: {ytdlp: boolean; ffmpeg: boolean};
      extractorFlags: string[];
      tmp: {dir: string; keepTmp: boolean; maxAgeMs: number};
      jobs: {store: string};
    };
    expect(body.ok).toBe(true);
    expect(body.service).toBe('ax-clipforge-backend');
    expect(typeof body.binaries.ytdlp).toBe('boolean');
    expect(typeof body.binaries.ffmpeg).toBe('boolean');
    expect(body.extractorFlags).toContain('--no-warnings');
    expect(body.tmp.keepTmp).toBe(true);
    expect(body.tmp.dir.length).toBeGreaterThan(0);
    expect(body.tmp.maxAgeMs).toBeGreaterThan(0);
    expect(body.jobs.store).toBe('memory');
  });

  it('GET /robots.txt disallows all crawlers', async () => {
    const base = await listen();
    const res = await fetch(`${base}/robots.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    const body = await res.text();
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Disallow: /');
  });

  it('GET /api/v1/health reports KEEP_TMP=false when Docker-style env is set', async () => {
    const env = loadEnv({
      PORT: '0',
      PUBLIC_API_URL: 'http://localhost:5000',
      CORS_ORIGINS: 'http://localhost:5173',
      KEEP_TMP: 'false',
    });
    const app = createApp(env);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const addr = server.address() as AddressInfo;
    const res = await fetch(
      `http://127.0.0.1:${String(addr.port)}/api/v1/health`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {tmp: {keepTmp: boolean}};
    expect(body.tmp.keepTmp).toBe(false);
  });

  it('POST /api/v1/info and GET /api/v1/download validate input without yt-dlp', async () => {
    const env = loadEnv({
      PORT: '0',
      PUBLIC_API_URL: 'http://localhost:5000',
      CORS_ORIGINS: 'http://localhost:5173',
      YTDLP_BIN: 'clipforge-missing-ytdlp',
    });
    const app = createApp(env);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const addr = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${String(addr.port)}`;

    const missingUrl = await fetch(`${base}/api/v1/info`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{}',
    });
    expect(missingUrl.status).toBe(400);

    const badUrl = await fetch(`${base}/api/v1/info`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({url: 'https://example.com'}),
    });
    expect(badUrl.status).toBe(400);

    const noBinary = await fetch(`${base}/api/v1/info`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
      }),
    });
    expect(noBinary.status).toBe(503);
    expect(await noBinary.json()).toMatchObject({error: 'unavailable'});

    const downloadMissing = await fetch(`${base}/api/v1/download`);
    expect(downloadMissing.status).toBe(400);

    const crawler = await fetch(
      `${base}/api/v1/download?url=https://www.youtube.com/watch?v=dQw4w9wgGcQ&format=mp4`,
      {headers: {'user-agent': 'facebookexternalhit/1.1'}},
    );
    expect(crawler.status).toBe(403);

    const downloadNoBinary = await fetch(
      `${base}/api/v1/download?url=https://www.youtube.com/watch?v=dQw4w9wgGcQ&format=mp4`,
    );
    expect(downloadNoBinary.status).toBe(503);

    const jobNoBinary = await fetch(`${base}/api/v1/jobs`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
        format: 'mp4',
      }),
    });
    expect(jobNoBinary.status).toBe(503);
  });

  it('returns 400 for malformed JSON, invalid clips, and colliding quality', async () => {
    const base = await listen();
    const malformed = await fetch(`${base}/api/v1/jobs`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{"url":',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({error: 'invalid_json'});

    const xorRange = await fetch(
      `${base}/api/v1/download?url=dQw4w9wgGcQ&start=10`,
    );
    expect(xorRange.status).toBe(400);

    const reversed = await fetch(`${base}/api/v1/jobs`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
        start: 30,
        end: 10,
      }),
    });
    expect(reversed.status).toBe(400);

    const bangQuality = await fetch(`${base}/api/v1/jobs`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
        format: 'mp4',
        quality: '720p!',
      }),
    });
    expect(bangQuality.status).toBe(400);

    const lookalike = await fetch(`${base}/api/v1/info`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({url: 'https://notyoutube.com/watch?v=dQw4w9wgGcQ'}),
    });
    expect(lookalike.status).toBe(400);
  });
});
