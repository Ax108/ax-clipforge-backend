import {afterEach, describe, expect, it} from '@jest/globals';
import type {AddressInfo} from 'node:net';
import type {Server} from 'node:http';
import {createApp} from '../app.js';
import {loadEnv} from '../config/env.js';

describe('rate limits', () => {
  let server: Server;

  afterEach(async () => {
    if (!server) return;
    const current = server;
    server = undefined as unknown as Server;
    await new Promise<void>((resolve, reject) => {
      current.close(err => (err ? reject(err) : resolve()));
    });
  });

  async function listen(overrides: NodeJS.ProcessEnv = {}) {
    const env = loadEnv({
      PORT: '0',
      PUBLIC_API_URL: 'http://localhost:5000',
      CORS_ORIGINS: 'http://localhost:5173',
      YTDLP_BIN: 'clipforge-missing-ytdlp',
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_WINDOW_MS: '60000',
      RATE_LIMIT_EXTRACT_MAX: '2',
      RATE_LIMIT_FILE_MAX: '2',
      RATE_LIMIT_JOB_READ_MAX: '2',
      ...overrides,
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

  it('returns 429 on extract routes after the IP budget is spent', async () => {
    const base = await listen();
    const body = JSON.stringify({
      url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
    });
    const opts: RequestInit = {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body,
    };

    const first = await fetch(`${base}/api/v1/jobs`, opts);
    const second = await fetch(`${base}/api/v1/jobs`, opts);
    const third = await fetch(`${base}/api/v1/jobs`, opts);

    // Missing yt-dlp → 503; still counts toward extract limit.
    expect([503, 202, 200]).toContain(first.status);
    expect([503, 202, 200]).toContain(second.status);
    expect(third.status).toBe(429);
    const limited = (await third.json()) as {
      error: string;
      message: string;
    };
    expect(limited.error).toBe('rate_limited');
    expect(limited.message.toLowerCase()).toContain('extract');
    expect(third.headers.get('ratelimit-limit')).toBe('2');
  });

  it('does not rate-limit health or robots.txt', async () => {
    const base = await listen({RATE_LIMIT_EXTRACT_MAX: '1'});
    for (let i = 0; i < 3; i++) {
      expect((await fetch(`${base}/api/v1/health`)).status).toBe(200);
      expect((await fetch(`${base}/robots.txt`)).status).toBe(200);
    }
  }, 15_000);

  it('loadEnv disables rate limits by default under NODE_ENV=test', () => {
    expect(loadEnv({NODE_ENV: 'test'}).RATE_LIMIT_ENABLED).toBe(false);
    expect(loadEnv({NODE_ENV: 'production'}).RATE_LIMIT_ENABLED).toBe(true);
    expect(
      loadEnv({NODE_ENV: 'test', RATE_LIMIT_ENABLED: 'true'})
        .RATE_LIMIT_ENABLED,
    ).toBe(true);
  });
});
