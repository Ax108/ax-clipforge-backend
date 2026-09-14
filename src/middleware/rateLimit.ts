import type {NextFunction, Request, RequestHandler, Response} from 'express';
import {rateLimit} from 'express-rate-limit';
import type {AppEnv} from '../config/env.js';

const passThrough: RequestHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  next();
};

export type RateLimiters = {
  extract: RequestHandler;
  file: RequestHandler;
  jobRead: RequestHandler;
};

/** Build IP rate limiters. No-ops when RATE_LIMIT_ENABLED=false (tests / emergency). */
export function createRateLimiters(env: AppEnv): RateLimiters {
  if (!env.RATE_LIMIT_ENABLED) {
    return {
      extract: passThrough,
      file: passThrough,
      jobRead: passThrough,
    };
  }

  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const common = {
    windowMs,
    standardHeaders: true as const,
    legacyHeaders: false as const,
  };

  return {
    extract: rateLimit({
      ...common,
      limit: env.RATE_LIMIT_EXTRACT_MAX,
      message: {
        error: 'rate_limited',
        message:
          'Too many extract requests from this IP. Try again after the rate limit window.',
      },
      handler: (_req, res, _next, options) => {
        res.status(options.statusCode).json(options.message);
      },
    }),
    file: rateLimit({
      ...common,
      limit: env.RATE_LIMIT_FILE_MAX,
      message: {
        error: 'rate_limited',
        message:
          'Too many file download requests from this IP. Try again after the rate limit window.',
      },
      handler: (_req, res, _next, options) => {
        res.status(options.statusCode).json(options.message);
      },
    }),
    jobRead: rateLimit({
      ...common,
      limit: env.RATE_LIMIT_JOB_READ_MAX,
      message: {
        error: 'rate_limited',
        message:
          'Too many job status requests from this IP. Try again after the rate limit window.',
      },
      handler: (_req, res, _next, options) => {
        res.status(options.statusCode).json(options.message);
      },
    }),
  };
}
