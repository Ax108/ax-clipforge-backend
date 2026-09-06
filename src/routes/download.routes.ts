import {Router} from 'express';
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
import type {JobService} from '../services/job.service.js';
import type {YtDlpService} from '../services/ytdlp.service.js';

export function downloadRouter(jobs: JobService): Router {
  const router = Router();
  router.get('/', (req, res, next) => {
    void download(jobs, req, res).catch(next);
  });
  router.post('/', (req, res, next) => {
    void download(jobs, req, res).catch(next);
  });
  return router;
}

export function audioRouter(jobs: JobService): Router {
  const router = Router();
  router.post('/jobs', (req, res, next) => {
    void createAudioJob(jobs, req, res).catch(next);
  });
  router.get('/', (req, res, next) => {
    void audio(jobs, req, res).catch(next);
  });
  router.post('/', (req, res, next) => {
    void audio(jobs, req, res).catch(next);
  });
  return router;
}

export function jobRouter(jobs: JobService): Router {
  const router = Router();
  router.post('/', (req, res, next) => {
    void createJob(jobs, req, res).catch(next);
  });
  router.get('/:id/events', (req, res, next) => {
    void jobEvents(jobs, req, res).catch(next);
  });
  router.get('/:id/file', (req, res, next) => {
    void jobFile(jobs, req, res).catch(next);
  });
  router.get('/:id', (req, res, next) => {
    void getJob(jobs, req, res).catch(next);
  });
  return router;
}

export function infoRouter(ytdlp: YtDlpService): Router {
  const router = Router();
  router.post('/', (req, res, next) => {
    void info(ytdlp, req, res).catch(next);
  });
  return router;
}
