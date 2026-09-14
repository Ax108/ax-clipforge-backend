import {Router, type RequestHandler} from 'express';
import {
  audio,
  createAudioJob,
  createJob,
  download,
  getJob,
  jobEvents,
  jobFile,
  info,
} from '../controllers/download.controller.js';
import type {RateLimiters} from '../middleware/rateLimit.js';
import type {JobService} from '../services/job.service.js';
import type {YtDlpService} from '../services/ytdlp.service.js';

export function downloadRouter(
  jobs: JobService,
  extractLimit: RequestHandler,
): Router {
  const router = Router();
  router.get('/', extractLimit, (req, res, next) => {
    void download(jobs, req, res).catch(next);
  });
  router.post('/', extractLimit, (req, res, next) => {
    void download(jobs, req, res).catch(next);
  });
  return router;
}

export function audioRouter(
  jobs: JobService,
  extractLimit: RequestHandler,
): Router {
  const router = Router();
  router.post('/jobs', extractLimit, (req, res, next) => {
    void createAudioJob(jobs, req, res).catch(next);
  });
  router.get('/', extractLimit, (req, res, next) => {
    void audio(jobs, req, res).catch(next);
  });
  router.post('/', extractLimit, (req, res, next) => {
    void audio(jobs, req, res).catch(next);
  });
  return router;
}

export function jobRouter(jobs: JobService, limits: RateLimiters): Router {
  const router = Router();
  router.post('/', limits.extract, (req, res, next) => {
    void createJob(jobs, req, res).catch(next);
  });
  router.get('/:id/events', limits.jobRead, (req, res, next) => {
    void jobEvents(jobs, req, res).catch(next);
  });
  router.get('/:id/file', limits.file, (req, res, next) => {
    void jobFile(jobs, req, res).catch(next);
  });
  router.get('/:id', limits.jobRead, (req, res, next) => {
    void getJob(jobs, req, res).catch(next);
  });
  return router;
}

export function infoRouter(
  ytdlp: YtDlpService,
  extractLimit: RequestHandler,
): Router {
  const router = Router();
  router.post('/', extractLimit, (req, res, next) => {
    void info(ytdlp, req, res).catch(next);
  });
  return router;
}
