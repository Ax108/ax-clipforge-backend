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

  app.disable('x-powered-by');
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
      ],
    }),
  );

  app.get('/', (_req, res) => {
    res.json({
      service: 'ax-clipforge-backend',
      docs: '/api/v1/health',
    });
  });

  app.use('/api/v1/health', healthRouter(ytdlp, jobs));
  app.use('/api/v1/info', infoRouter(ytdlp));
  app.use('/api/v1/jobs', jobRouter(jobs));
  app.use('/api/v1/download', downloadRouter(jobs));
  app.use('/api/v1/audio', audioRouter(jobs));

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
