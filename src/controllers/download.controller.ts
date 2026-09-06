import type {Request, Response} from 'express';
import {
  audioRequestSchema,
  downloadRequestSchema,
  infoRequestSchema,
} from '../config/request.js';
import {isLinkPreviewCrawler} from '../lib/crawler.js';
import {mimeForFormat} from '../lib/formats.js';
import {sendAttachment} from '../lib/send-file.js';
import {
  isFfmpegAvailable,
  isMediabunnyAvailable,
} from '../services/media.service.js';
import type {JobService} from '../services/job.service.js';
import {YtDlpError, type YtDlpService} from '../services/ytdlp.service.js';

export async function health(
  ytdlp: YtDlpService,
  jobs: JobService,
  _req: Request,
  res: Response,
): Promise<void> {
  const [ytdlpOk, ffmpegOk, mediabunnyOk, ytdlpVersion] = await Promise.all([
    ytdlp.isAvailable(),
    isFfmpegAvailable(),
    isMediabunnyAvailable(),
    ytdlp.version(),
  ]);

  const extractorFlags = ytdlp.extraArgs().filter(arg => arg.startsWith('--'));
  const tmp = ytdlp.tmpConfig();

  res.status(200).json({
    ok: true,
    service: 'ax-clipforge-backend',
    binaries: {
      ytdlp: ytdlpOk,
      ffmpeg: ffmpegOk,
      mediabunny: mediabunnyOk,
    },
    ytdlpVersion,
    extractorFlags,
    tmp,
    jobs: {store: jobs.store.kind},
  });
}

export async function info(
  ytdlp: YtDlpService,
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = infoRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'invalid_request',
      details: parsed.error.issues.map(issue => issue.message),
    });
    return;
  }

  try {
    const meta = await ytdlp.probe(parsed.data.url);
    res.status(200).json(meta);
  } catch (err) {
    sendYtDlpError(res, err);
  }
}

type ExtractSchema = typeof downloadRequestSchema | typeof audioRequestSchema;

export async function download(
  jobs: JobService,
  req: Request,
  res: Response,
): Promise<void> {
  await streamExtract(jobs, req, res, downloadRequestSchema);
}

export async function audio(
  jobs: JobService,
  req: Request,
  res: Response,
): Promise<void> {
  await streamExtract(jobs, req, res, audioRequestSchema);
}

export async function createJob(
  jobs: JobService,
  req: Request,
  res: Response,
): Promise<void> {
  await startJob(jobs, req, res, downloadRequestSchema);
}

export async function createAudioJob(
  jobs: JobService,
  req: Request,
  res: Response,
): Promise<void> {
  await startJob(jobs, req, res, audioRequestSchema);
}

async function streamExtract(
  jobs: JobService,
  req: Request,
  res: Response,
  schema: ExtractSchema,
): Promise<void> {
  if (isLinkPreviewCrawler(req.get('user-agent'))) {
    res.status(403).json({error: 'crawler_forbidden'});
    return;
  }

  const source = req.method === 'GET' ? req.query : req.body;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    res.status(400).json({
      error: 'invalid_request',
      details: parsed.error.issues.map(issue => issue.message),
    });
    return;
  }

  try {
    const job = await jobs.start(parsed.data);
    const done = await jobs.waitUntilDone(job.id);
    if (done.stage === 'error' || !done.filePath) {
      res.status(502).json({
        error: done.error || 'download_failed',
        message: done.message,
      });
      return;
    }
    await sendAttachment(
      req,
      res,
      done.filePath,
      mimeForFormat(parsed.data.format),
      done.filename || `${done.cacheKey}.${parsed.data.format}`,
    );
  } catch (err) {
    if (!res.headersSent) sendYtDlpError(res, err);
  }
}

async function startJob(
  jobs: JobService,
  req: Request,
  res: Response,
  schema: ExtractSchema,
): Promise<void> {
  if (isLinkPreviewCrawler(req.get('user-agent'))) {
    res.status(403).json({error: 'crawler_forbidden'});
    return;
  }
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'invalid_request',
      details: parsed.error.issues.map(issue => issue.message),
    });
    return;
  }
  try {
    const job = await jobs.start(parsed.data);
    res.status(job.cached ? 200 : 202).json(jobs.toPublic(job));
  } catch (err) {
    sendYtDlpError(res, err);
  }
}

export async function getJob(
  jobs: JobService,
  req: Request,
  res: Response,
): Promise<void> {
  const id = String(req.params.id ?? '');
  const job = await jobs.store.get(id);
  if (!job) {
    res.status(404).json({error: 'job_not_found'});
    return;
  }
  res.status(200).json(jobs.toPublic(job));
}

export async function jobEvents(
  jobs: JobService,
  req: Request,
  res: Response,
): Promise<void> {
  const id = String(req.params.id ?? '');
  const existing = await jobs.store.get(id);
  if (!existing) {
    res.status(404).json({error: 'job_not_found'});
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  let unsub = (): void => {};
  const write = (record: typeof existing) => {
    if (closed) return;
    res.write(
      `event: progress\ndata: ${JSON.stringify(jobs.toPublic(record))}\n\n`,
    );
  };
  const finishIfTerminal = (record: typeof existing) => {
    if (record.stage !== 'complete' && record.stage !== 'error') return false;
    closed = true;
    unsub();
    res.end();
    return true;
  };

  req.on('close', () => {
    closed = true;
    unsub();
  });
  unsub = await jobs.store.subscribe(id, next => {
    write(next);
    finishIfTerminal(next);
  });
  if (closed) {
    unsub();
    return;
  }

  const latest = await jobs.store.get(id);
  if (!latest) {
    closed = true;
    unsub();
    res.end();
    return;
  }
  write(latest);
  finishIfTerminal(latest);
}

export async function jobFile(
  jobs: JobService,
  req: Request,
  res: Response,
): Promise<void> {
  if (isLinkPreviewCrawler(req.get('user-agent'))) {
    res.status(403).json({error: 'crawler_forbidden'});
    return;
  }
  const id = String(req.params.id ?? '');
  const job = await jobs.store.get(id);
  if (!job) {
    res.status(404).json({error: 'job_not_found'});
    return;
  }
  if (job.stage !== 'complete' || !job.filePath) {
    res.status(409).json({error: 'job_not_ready', stage: job.stage});
    return;
  }
  await sendAttachment(
    req,
    res,
    job.filePath,
    mimeForFormat(job.request.format),
    job.filename || `${job.cacheKey}.${job.request.format}`,
  );
}

function sendYtDlpError(res: Response, err: unknown): void {
  if (err instanceof YtDlpError) {
    const status =
      err.code === 'invalid_url' ? 400 : err.code === 'unavailable' ? 503 : 502;
    res.status(status).json({error: err.code, message: err.message});
    return;
  }
  res.status(500).json({error: 'internal_error'});
}
