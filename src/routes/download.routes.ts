import {Router} from 'express';
import {notImplemented} from '../controllers/download.controller.js';

export function downloadRouter(): Router {
  const router = Router();
  router.get('/', notImplemented);
  router.post('/', notImplemented);
  return router;
}

export function infoRouter(): Router {
  const router = Router();
  router.post('/', notImplemented);
  return router;
}
