import 'dotenv/config';
import {mkdir} from 'node:fs/promises';
import {createApp} from './app.js';
import {loadEnv} from './config/env.js';
import {cacheDir, evictCache, sweepPartFiles} from './lib/cache-files.js';
import {createJobStore} from './store/redis-job-store.js';
import {MemoryJobStore} from './store/memory-job-store.js';

const env = loadEnv();
const mediaDir = cacheDir(env.TMP_DIR);
await mkdir(mediaDir, {recursive: true});

async function sweepCache(): Promise<void> {
  const parts = await sweepPartFiles(mediaDir, env.TMP_MAX_AGE_MS);
  if (parts > 0) {
    console.log(`Swept ${String(parts)} stale .part file(s) from ${mediaDir}`);
  }
  if (env.KEEP_TMP) return;
  const evicted = await evictCache(mediaDir, {
    maxAgeMs: env.CACHE_TTL_MS,
    maxBytes: env.CACHE_MAX_BYTES,
  });
  if (evicted > 0) {
    console.log(
      `Evicted ${String(evicted)} cached extract(s) from ${mediaDir}`,
    );
  }
}

if (env.KEEP_TMP) {
  console.log(`KEEP_TMP=true - cache stays in ${mediaDir} (no TTL eviction)`);
} else {
  await sweepCache();
  const sweepEveryMs = Math.min(
    Math.max(60_000, Math.floor(env.TMP_MAX_AGE_MS / 3)),
    300_000,
  );
  const sweepTimer = setInterval(() => {
    void sweepCache();
  }, sweepEveryMs);
  sweepTimer.unref();
}

const store = await createJobStore(
  env.REDIS_URL,
  env.JOB_TTL_MS,
  env.DOWNLOAD_TIMEOUT_MS,
);
const app = createApp(env, store);

const server = app.listen(env.PORT, env.LISTEN_HOST, () => {
  console.log(
    `ClipForge API listening on ${env.LISTEN_HOST}:${String(env.PORT)} (${env.PUBLIC_API_URL})`,
  );
  console.log(`CORS allowlist: ${env.corsOrigins.join(', ')}`);
  console.log(
    `TMP_DIR=${env.TMP_DIR} KEEP_TMP=${String(env.KEEP_TMP)} jobs=${store.kind}`,
  );
});

async function shutdown(): Promise<void> {
  if (store instanceof MemoryJobStore) await store.close();
  else await store.close();
  await new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
}

process.once('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});
process.once('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});
