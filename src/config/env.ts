import {z} from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(5000),
  PUBLIC_API_URL: z.string().min(1).default('http://localhost:5000'),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:5173'),
  PROXY_URL: z.string().optional().default(''),
  COOKIE_FILE_PATH: z.string().optional().default(''),
  PO_TOKEN: z.string().optional().default(''),
  NODE_ENV: z.string().optional().default('development'),
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
    PUBLIC_API_URL: source.PUBLIC_API_URL,
    CORS_ORIGINS: source.CORS_ORIGINS,
    PROXY_URL: source.PROXY_URL,
    COOKIE_FILE_PATH: source.COOKIE_FILE_PATH,
    PO_TOKEN: source.PO_TOKEN,
    NODE_ENV: source.NODE_ENV,
  });
  return {
    ...parsed,
    corsOrigins: parseCorsOrigins(parsed.CORS_ORIGINS),
  };
}
