import {Router} from 'express';
import {health} from '../controllers/download.controller.js';
import type {JobService} from '../services/job.service.js';
import type {YtDlpService} from '../services/ytdlp.service.js';

export function healthRouter(ytdlp: YtDlpService, jobs: JobService): Router {
  const router = Router();
  router.get('/', (req, res, next) => {
    void health(ytdlp, jobs, req, res).catch(next);
  });
  return router;
}
