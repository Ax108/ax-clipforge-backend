import cors from 'cors';
import express, {type Express} from 'express';
import type {AppEnv} from './config/env.js';
import {downloadRouter, infoRouter} from './routes/download.routes.js';
import {healthRouter} from './routes/health.routes.js';
import {YtDlpService} from './services/ytdlp.service.js';

export function createApp(env: AppEnv): Express {
  const app = express();
  const ytdlp = new YtDlpService(env);

  app.disable('x-powered-by');
  app.use(express.json({limit: '1mb'}));
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: false,
    }),
  );

  app.get('/', (_req, res) => {
    res.json({
      service: 'ax-clipforge-backend',
      docs: '/api/v1/health',
    });
  });

  app.use('/api/v1/health', healthRouter(ytdlp));
  app.use('/api/v1/info', infoRouter());
  app.use('/api/v1/download', downloadRouter());

  return app;
}
