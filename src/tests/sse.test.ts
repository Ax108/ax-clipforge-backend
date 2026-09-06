import {afterEach, describe, expect, it} from '@jest/globals';
import type {AddressInfo} from 'node:net';
import type {Server} from 'node:http';
import {createApp} from '../app.js';
import {loadEnv} from '../config/env.js';
import {MemoryJobStore} from '../store/memory-job-store.js';
import type {JobRecord} from '../store/job-store.js';

class CompletesOnSecondGet extends MemoryJobStore {
  private gets = 0;

  override async get(id: string): Promise<JobRecord | null> {
    const job = await super.get(id);
    this.gets += 1;
    if (job && this.gets >= 2 && job.stage !== 'complete') {
      const done: JobRecord = {
        ...job,
        stage: 'complete',
        percent: 100,
        message: 'Extract ready',
      };
      await this.save(done);
      return done;
    }
    return job;
  }
}

describe('SSE job events', () => {
  let server: Server;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  });

  it('ends when the job completes between the first snapshot and subscribe', async () => {
    const store = new CompletesOnSecondGet();
    await store.save({
      id: 'sse-1',
      cacheKey: 'dQw4w9wgGcQ_mp4_480p_full',
      stage: 'downloading',
      percent: 40,
      message: 'Downloading',
      cached: false,
      request: {
        url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
        format: 'mp4',
        quality: '480p',
      },
      updatedAt: Date.now(),
    });

    const env = loadEnv({
      PORT: '0',
      PUBLIC_API_URL: 'http://localhost:5000',
      CORS_ORIGINS: 'http://localhost:5173',
    });
    const app = createApp(env, store);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const addr = server.address() as AddressInfo;
    const res = await fetch(
      `http://127.0.0.1:${String(addr.port)}/api/v1/jobs/sse-1/events`,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"stage":"complete"');
  });

  it('unsubscribes if the client disconnects while subscribe is still pending', async () => {
    const store = new DelayedSubscribeStore();
    await store.save({
      id: 'sse-2',
      cacheKey: 'dQw4w9wgGcQ_mp4_480p_full',
      stage: 'downloading',
      percent: 10,
      message: 'Downloading',
      cached: false,
      request: {
        url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
        format: 'mp4',
        quality: '480p',
      },
      updatedAt: Date.now(),
    });

    const env = loadEnv({
      PORT: '0',
      PUBLIC_API_URL: 'http://localhost:5000',
      CORS_ORIGINS: 'http://localhost:5173',
    });
    const app = createApp(env, store);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const addr = server.address() as AddressInfo;
    const ac = new AbortController();
    const pending = fetch(
      `http://127.0.0.1:${String(addr.port)}/api/v1/jobs/sse-2/events`,
      {signal: ac.signal},
    );
    await new Promise(resolve => {
      setTimeout(resolve, 20);
    });
    ac.abort();
    await pending.catch(() => undefined);
    await new Promise(resolve => {
      setTimeout(resolve, 80);
    });
    expect(store.unsubs).toBeGreaterThan(0);
  });
});

class DelayedSubscribeStore extends MemoryJobStore {
  unsubs = 0;

  override async subscribe(
    id: string,
    handler: (job: JobRecord) => void,
  ): Promise<() => void> {
    await new Promise(resolve => {
      setTimeout(resolve, 40);
    });
    const unsub = await super.subscribe(id, handler);
    return () => {
      this.unsubs += 1;
      unsub();
    };
  }
}
