import {describe, expect, it} from '@jest/globals';
import {
  BEGIN_JOB_LUA,
  RELEASE_INFLIGHT_LUA,
  RedisJobStore,
  type RedisConn,
} from '../store/redis-job-store.js';
import type {JobRecord} from '../store/job-store.js';

class FakeRedis implements RedisConn {
  readonly data = new Map<string, string>();
  readonly subs = new Map<string, Set<(message: string) => void>>();
  subscribeDelayMs = 0;

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    opts?: {expiration?: {type: 'EX'; value: number}; condition?: 'NX' | 'XX'},
  ): Promise<string | null> {
    if (opts?.condition === 'NX' && this.data.has(key)) return null;
    if (opts?.condition === 'XX' && !this.data.has(key)) return null;
    this.data.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0;
  }

  async eval(
    script: string,
    opts: {keys: string[]; arguments: string[]},
  ): Promise<unknown> {
    if (script === BEGIN_JOB_LUA) {
      const [inflightKey, jobKey, prefix] = opts.keys;
      const [jobId, json] = opts.arguments;
      const cur = this.data.get(inflightKey);
      if (cur) {
        const rec = this.data.get(`${prefix}${cur}`);
        if (rec) return ['joined', rec];
        this.data.delete(inflightKey);
      }
      this.data.set(inflightKey, jobId);
      this.data.set(jobKey, json);
      return ['started'];
    }
    if (script === RELEASE_INFLIGHT_LUA) {
      const key = opts.keys[0];
      const jobId = opts.arguments[0];
      if (this.data.get(key) === jobId) {
        this.data.delete(key);
        return 1;
      }
      return 0;
    }
    throw new Error('unknown eval script');
  }

  async publish(channel: string, message: string): Promise<number> {
    const listeners = this.subs.get(channel);
    if (listeners) {
      for (const listener of listeners) listener(message);
    }
    return listeners?.size ?? 0;
  }

  async subscribe(
    channel: string,
    listener: (message: string) => void,
  ): Promise<void> {
    if (this.subscribeDelayMs > 0) {
      await new Promise(resolve => {
        setTimeout(resolve, this.subscribeDelayMs);
      });
    }
    const set = this.subs.get(channel) ?? new Set();
    set.add(listener);
    this.subs.set(channel, set);
  }

  async unsubscribe(
    channel: string,
    listener: (message: string) => void,
  ): Promise<void> {
    this.subs.get(channel)?.delete(listener);
  }

  async close(): Promise<void> {
    this.data.clear();
    this.subs.clear();
  }

  duplicate(): RedisConn {
    return this;
  }

  async connect(): Promise<void> {
    /* no-op */
  }

  on(): void {
    /* no-op */
  }
}

function sampleJob(
  id: string,
  stage: JobRecord['stage'] = 'downloading',
): JobRecord {
  return {
    id,
    cacheKey: 'dQw4w9wgGcQ_mp4_480p_full',
    stage,
    percent: stage === 'complete' ? 100 : 10,
    message: 'go',
    cached: false,
    request: {
      url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
      format: 'mp4',
      quality: '480p',
    },
    updatedAt: Date.now(),
  };
}

describe('RedisJobStore', () => {
  it('does not keep a job after Redis expires the key', async () => {
    const redis = new FakeRedis();
    const store = new RedisJobStore(redis, redis, 60_000);
    const job = sampleJob('job-1');
    await store.save(job);
    expect(await store.get('job-1')).toMatchObject({id: 'job-1'});
    redis.data.delete('clipforge:job:job-1');
    expect(await store.get('job-1')).toBeNull();
    await store.close();
  });

  it('emits each publish once to a subscriber', async () => {
    const redis = new FakeRedis();
    const store = new RedisJobStore(redis, redis, 60_000);
    const seen: string[] = [];
    const unsub = await store.subscribe('job-1', record => {
      seen.push(record.stage);
    });
    await store.publish(sampleJob('job-1'));
    unsub();
    expect(seen).toEqual(['downloading']);
    await store.close();
  });

  it('catches a terminal snapshot after a delayed Redis subscribe becomes ready', async () => {
    const redis = new FakeRedis();
    redis.subscribeDelayMs = 40;
    const store = new RedisJobStore(redis, redis, 60_000);
    await store.save(sampleJob('job-1', 'downloading'));
    const pending = store.subscribe('job-1', () => undefined);
    await store.publish(sampleJob('job-1', 'complete'));
    const unsub = await pending;
    const latest = await store.get('job-1');
    expect(latest?.stage).toBe('complete');
    unsub();
    await store.close();
  });

  it('joins a second beginJob onto the owner and only the owner can release', async () => {
    const redis = new FakeRedis();
    const store = new RedisJobStore(redis, redis, 60_000, 60_000);
    const a = sampleJob('a', 'queued');
    const b = sampleJob('b', 'queued');
    expect(await store.beginJob(a)).toEqual({kind: 'started'});
    const joined = await store.beginJob(b);
    expect(joined).toEqual({
      kind: 'joined',
      job: expect.objectContaining({id: 'a'}),
    });
    expect(await store.get('b')).toBeNull();
    expect(await store.releaseInFlight(a.cacheKey, 'b')).toBe(false);
    expect(await store.inFlightId(a.cacheKey)).toBe('a');
    expect(await store.releaseInFlight(a.cacheKey, 'a')).toBe(true);
    expect(await store.inFlightId(a.cacheKey)).toBeNull();
    await store.close();
  });
});
