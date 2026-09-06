import path from 'node:path';
import {z} from 'zod';

/** z.coerce.boolean treats the string "false" as true. Parse env flags explicitly. */
export function parseEnvBool(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  throw new Error('Invalid boolean environment value');
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(5000),
  LISTEN_HOST: z.string().min(1).default('127.0.0.1'),
  PUBLIC_API_URL: z.string().min(1).default('http://localhost:5000'),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:5173'),
  PROXY_URL: z.string().optional().default(''),
  COOKIE_FILE_PATH: z.string().optional().default(''),
  PO_TOKEN: z.string().optional().default(''),
  NODE_ENV: z.string().optional().default('development'),
  YTDLP_BIN: z.string().min(1).default('yt-dlp'),
  TMP_DIR: z.string().min(1).default(path.join(process.cwd(), 'tmp')),
  DOWNLOAD_CONCURRENCY: z.coerce.number().int().positive().default(1),
  DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  TMP_MAX_AGE_MS: z.coerce.number().int().positive().default(900_000),
  KEEP_TMP: z.boolean().default(true),
  REDIS_URL: z.string().optional().default(''),
  JOB_TTL_MS: z.coerce.number().int().positive().default(86_400_000),
  CACHE_TTL_MS: z.coerce.number().int().positive().default(86_400_000),
  CACHE_MAX_BYTES: z.coerce.number().int().positive().default(2_147_483_648),
});

export type AppEnv = z.infer<typeof envSchema> & {
  corsOrigins: string[];
};

export function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.parse({
    PORT: source.PORT,
    LISTEN_HOST: source.LISTEN_HOST,
    PUBLIC_API_URL: source.PUBLIC_API_URL,
    CORS_ORIGINS: source.CORS_ORIGINS,
    PROXY_URL: source.PROXY_URL,
    COOKIE_FILE_PATH: source.COOKIE_FILE_PATH,
    PO_TOKEN: source.PO_TOKEN,
    NODE_ENV: source.NODE_ENV,
    YTDLP_BIN: source.YTDLP_BIN,
    TMP_DIR: source.TMP_DIR,
    DOWNLOAD_CONCURRENCY: source.DOWNLOAD_CONCURRENCY,
    DOWNLOAD_TIMEOUT_MS: source.DOWNLOAD_TIMEOUT_MS,
    TMP_MAX_AGE_MS: source.TMP_MAX_AGE_MS,
    KEEP_TMP: parseEnvBool(source.KEEP_TMP, true),
    REDIS_URL: source.REDIS_URL,
    JOB_TTL_MS: source.JOB_TTL_MS,
    CACHE_TTL_MS: source.CACHE_TTL_MS,
    CACHE_MAX_BYTES: source.CACHE_MAX_BYTES,
  });
  return {
    ...parsed,
    corsOrigins: parseCorsOrigins(parsed.CORS_ORIGINS),
  };
}
