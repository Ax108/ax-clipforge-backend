import {createClient} from 'redis';
import {MemoryJobStore} from './memory-job-store.js';
import type {
  BeginJobResult,
  JobEventHandler,
  JobRecord,
  JobStore,
  JobStoreKind,
} from './job-store.js';

export type RedisConn = {
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: string,
    opts?: {
      expiration?: {type: 'EX'; value: number};
      condition?: 'NX' | 'XX';
    },
  ) => Promise<string | null>;
  del: (key: string) => Promise<number>;
  eval: (
    script: string,
    opts: {keys: string[]; arguments: string[]},
  ) => Promise<unknown>;
  publish: (channel: string, message: string) => Promise<unknown>;
  subscribe: (
    channel: string,
    listener: (message: string) => void,
  ) => Promise<unknown>;
  unsubscribe: (
    channel: string,
    listener: (message: string) => void,
  ) => Promise<unknown>;
  close: () => Promise<unknown>;
  duplicate: () => RedisConn;
  connect: () => Promise<unknown>;
  on: (event: string, listener: (err: Error) => void) => unknown;
};

const JOB_PREFIX = 'clipforge:job:';
const CHAN_PREFIX = 'clipforge:chan:';
const INFLIGHT_PREFIX = 'clipforge:inflight:';

export const BEGIN_JOB_LUA = `
local cur = redis.call('GET', KEYS[1])
if cur then
  local rec = redis.call('GET', KEYS[3] .. cur)
  if rec then
    return {'joined', rec}
  end
  redis.call('DEL', KEYS[1])
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
redis.call('SET', KEYS[2], ARGV[2], 'EX', tonumber(ARGV[4]))
return {'started'}
`;

export const RELEASE_INFLIGHT_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export class RedisJobStore implements JobStore {
  readonly kind: JobStoreKind = 'redis';
  private readonly client: RedisConn;
  private readonly sub: RedisConn;
  private readonly ttlSec: number;
  private readonly inflightTtlSec: number;

  constructor(
    client: RedisConn,
    sub: RedisConn,
    ttlMs: number,
    inflightTtlMs = ttlMs,
  ) {
    this.client = client;
    this.sub = sub;
    this.ttlSec = Math.max(60, Math.floor(ttlMs / 1000));
    this.inflightTtlSec = Math.max(60, Math.floor(inflightTtlMs / 1000));
  }

  async get(id: string): Promise<JobRecord | null> {
    const raw = await this.client.get(`${JOB_PREFIX}${id}`);
    if (!raw) return null;
    return parseJob(raw);
  }

  async save(job: JobRecord): Promise<void> {
    await this.client.set(`${JOB_PREFIX}${job.id}`, JSON.stringify(job), {
      expiration: {type: 'EX', value: this.ttlSec},
    });
  }

  async remove(id: string): Promise<void> {
    await this.client.del(`${JOB_PREFIX}${id}`);
  }

  async inFlightId(cacheKey: string): Promise<string | null> {
    return this.client.get(`${INFLIGHT_PREFIX}${cacheKey}`);
  }

  async beginJob(job: JobRecord): Promise<BeginJobResult> {
    const reply = await this.client.eval(BEGIN_JOB_LUA, {
      keys: [
        `${INFLIGHT_PREFIX}${job.cacheKey}`,
        `${JOB_PREFIX}${job.id}`,
        JOB_PREFIX,
      ],
      arguments: [
        job.id,
        JSON.stringify(job),
        String(this.inflightTtlSec),
        String(this.ttlSec),
      ],
    });
    const row = Array.isArray(reply) ? reply : [reply];
    if (row[0] === 'joined' && typeof row[1] === 'string') {
      const existing = parseJob(row[1]);
      if (existing) return {kind: 'joined', job: existing};
    }
    return {kind: 'started'};
  }

  async releaseInFlight(cacheKey: string, jobId: string): Promise<boolean> {
    const reply = await this.client.eval(RELEASE_INFLIGHT_LUA, {
      keys: [`${INFLIGHT_PREFIX}${cacheKey}`],
      arguments: [jobId],
    });
    return reply === 1 || reply === '1';
  }

  async subscribe(id: string, handler: JobEventHandler): Promise<() => void> {
    const chan = `${CHAN_PREFIX}${id}`;
    const onMessage = (message: string) => {
      try {
        handler(JSON.parse(message) as JobRecord);
      } catch {
        /* ignore */
      }
    };
    await this.sub.subscribe(chan, onMessage);
    return () => {
      void this.sub.unsubscribe(chan, onMessage);
    };
  }

  async publish(job: JobRecord): Promise<void> {
    await this.save(job);
    await this.client.publish(`${CHAN_PREFIX}${job.id}`, JSON.stringify(job));
  }

  async close(): Promise<void> {
    await this.sub.close();
    await this.client.close();
  }
}

function parseJob(raw: string): JobRecord | null {
  try {
    return JSON.parse(raw) as JobRecord;
  } catch {
    return null;
  }
}

export async function createJobStore(
  redisUrl: string,
  ttlMs: number,
  inflightTtlMs = ttlMs,
): Promise<JobStore> {
  if (!redisUrl) return new MemoryJobStore();
  try {
    const client = createClient({url: redisUrl}) as unknown as RedisConn;
    const sub = client.duplicate();
    client.on('error', err => {
      console.error('Redis error', err);
    });
    await client.connect();
    await sub.connect();
    console.log(`Job store: redis (${redisUrl})`);
    return new RedisJobStore(client, sub, ttlMs, inflightTtlMs);
  } catch (err) {
    console.warn(
      `Redis unavailable (${redisUrl}), using in-memory job store`,
      err,
    );
    return new MemoryJobStore();
  }
}
