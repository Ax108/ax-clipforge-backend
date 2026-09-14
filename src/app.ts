import cors from 'cors';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import type {AppEnv} from './config/env.js';
import {
  audioRouter,
  downloadRouter,
  infoRouter,
  jobRouter,
} from './routes/download.routes.js';
import {healthRouter} from './routes/health.routes.js';
import {createRateLimiters} from './middleware/rateLimit.js';
import {ROBOTS_TXT_BODY, blockSearchIndexing} from './middleware/robots.js';
import {JobService} from './services/job.service.js';
import {YtDlpService} from './services/ytdlp.service.js';
import type {JobStore} from './store/job-store.js';
import {MemoryJobStore} from './store/memory-job-store.js';

function isJsonParseError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {status?: number; type?: string; name?: string};
  return (
    e.type === 'entity.parse.failed' ||
    (e.name === 'SyntaxError' && e.status === 400)
  );
}

export function createApp(
  env: AppEnv,
  store: JobStore = new MemoryJobStore(),
): Express {
  const app = express();
  const ytdlp = new YtDlpService(env);
  const jobs = new JobService(env, ytdlp, store);
  const limits = createRateLimiters(env);

  app.disable('x-powered-by');
  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }
  app.use(blockSearchIndexing);
  app.use(express.json({limit: '1mb'}));
  app.use(express.urlencoded({extended: false}));
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: false,
      exposedHeaders: [
        'Content-Disposition',
        'Accept-Ranges',
        'Content-Range',
        'Content-Length',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
      ],
    }),
  );

  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(ROBOTS_TXT_BODY);
  });

  app.get('/', (_req, res) => {
    res.json({
      service: 'ax-clipforge-backend',
      docs: '/api/v1/health',
    });
  });

  // /health and /robots.txt: no rate limit (probes / crawlers reading robots).
  app.use('/api/v1/health', healthRouter(ytdlp, jobs));
  app.use('/api/v1/info', infoRouter(ytdlp, limits.extract));
  app.use('/api/v1/jobs', jobRouter(jobs, limits));
  app.use('/api/v1/download', downloadRouter(jobs, limits.extract));
  app.use('/api/v1/audio', audioRouter(jobs, limits.extract));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (isJsonParseError(err)) {
      res
        .status(400)
        .json({error: 'invalid_json', message: 'Malformed JSON body'});
      return;
    }
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({error: 'internal_error'});
    }
  });

  return app;
}
