import {afterEach, describe, expect, it} from '@jest/globals';
import type {AddressInfo} from 'node:net';
import type {Server} from 'node:http';
import {createApp} from '../app.js';
import {loadEnv, parseCorsOrigins} from '../config/env.js';

describe('parseCorsOrigins', () => {
  it('splits a comma-separated allowlist', () => {
    expect(
      parseCorsOrigins('http://localhost:5173, https://YOUR_APP.vercel.app '),
    ).toEqual(['http://localhost:5173', 'https://YOUR_APP.vercel.app']);
  });
});

describe('API stubs', () => {
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
    const body = (await res.json()) as {
      ok: boolean;
      service: string;
      binaries: {ytdlp: boolean; ffmpeg: boolean; mediabunny: boolean};
      extractorFlags: string[];
    };
    expect(body.ok).toBe(true);
    expect(body.service).toBe('ax-clipforge-backend');
    expect(typeof body.binaries.ytdlp).toBe('boolean');
    expect(typeof body.binaries.ffmpeg).toBe('boolean');
    expect(typeof body.binaries.mediabunny).toBe('boolean');
    expect(body.extractorFlags).toContain('--no-warnings');
  });

  it('POST /api/v1/info and GET /api/v1/download are not implemented yet', async () => {
    const base = await listen();
    const info = await fetch(`${base}/api/v1/info`, {method: 'POST'});
    expect(info.status).toBe(501);
    expect(await info.json()).toEqual({status: 'not_implemented'});

    const download = await fetch(`${base}/api/v1/download`);
    expect(download.status).toBe(501);
    expect(await download.json()).toEqual({status: 'not_implemented'});
  });
});
