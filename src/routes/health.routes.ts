import {Router} from 'express';
import {health} from '../controllers/download.controller.js';
import type {YtDlpService} from '../services/ytdlp.service.js';

export function healthRouter(ytdlp: YtDlpService): Router {
  const router = Router();
  router.get('/', (req, res, next) => {
    void health(ytdlp, req, res).catch(next);
  });
  return router;
}
