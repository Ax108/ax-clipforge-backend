import {randomUUID} from 'node:crypto';
import path from 'node:path';
import type {AppEnv} from '../config/env.js';
import {cacheKeyFor} from '../lib/cache-key.js';
import {cacheDir, findCacheFile, touchFile} from '../lib/cache-files.js';
import type {DownloadRequest} from '../types.js';
import type {JobRecord, JobStore} from '../store/job-store.js';
import {YtDlpError, type YtDlpService} from './ytdlp.service.js';

export class JobService {
  private readonly env: AppEnv;
  private readonly ytdlp: YtDlpService;
  readonly store: JobStore;

  constructor(env: AppEnv, ytdlp: YtDlpService, store: JobStore) {
    this.env = env;
    this.ytdlp = ytdlp;
    this.store = store;
  }

  fileUrl(jobId: string): string {
    return `${this.env.PUBLIC_API_URL.replace(/\/$/, '')}/api/v1/jobs/${jobId}/file`;
  }

  toPublic(job: JobRecord) {
    return {
      id: job.id,
      cacheKey: job.cacheKey,
      stage: job.stage,
      percent: job.percent,
      message: job.message,
      cached: job.cached,
      error: job.error,
      filename: job.filename,
      fileUrl: job.filePath ? this.fileUrl(job.id) : undefined,
    };
  }

  async start(req: DownloadRequest): Promise<JobRecord> {
    const cacheKey = cacheKeyFor(req);
    if (!cacheKey) {
      throw new YtDlpError('Invalid YouTube URL', 'invalid_url');
    }

    const cached = await this.completeFromCache(req, cacheKey);
    if (cached) return cached;

    const inflightId = await this.store.inFlightId(cacheKey);
    if (inflightId) {
      const live = await this.liveJob(inflightId);
      if (live) return live;
      await this.store.releaseInFlight(cacheKey, inflightId);
    }

    const job: JobRecord = {
      id: randomUUID(),
      cacheKey,
      stage: 'queued',
      percent: 0,
      message: 'Queued for yt-dlp',
      cached: false,
      request: req,
      updatedAt: Date.now(),
    };

    const begun = await this.store.beginJob(job);
    if (begun.kind === 'joined') {
      if (await this.liveJob(begun.job.id)) return begun.job;
      await this.store.releaseInFlight(cacheKey, begun.job.id);
      const retry = await this.store.beginJob(job);
      if (retry.kind === 'joined') return retry.job;
    }

    const cachedAfterClaim = await this.completeFromCache(req, cacheKey);
    if (cachedAfterClaim) {
      await this.abortQueued(job);
      return cachedAfterClaim;
    }

    if (!(await this.ytdlp.isAvailable())) {
      await this.abortQueued(job);
      throw new YtDlpError('yt-dlp is not installed', 'unavailable');
    }

    await this.store.publish(job);
    void this.run(job);
    return job;
  }

  async waitUntilDone(id: string): Promise<JobRecord> {
    const timeoutMs = this.env.DOWNLOAD_TIMEOUT_MS + 5_000;
    let unsub = (): void => {};
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error('job_timeout'));
      }, timeoutMs);
      const finish = (job: JobRecord) => {
        if (job.stage !== 'complete' && job.stage !== 'error') return;
        clearTimeout(timer);
        unsub();
        resolve(job);
      };
      void this.store
        .subscribe(id, finish)
        .then(unsubscribe => {
          unsub = unsubscribe;
          return this.store.get(id);
        })
        .then(job => {
          if (job) finish(job);
          else {
            clearTimeout(timer);
            unsub();
            reject(new Error('job_not_found'));
          }
        })
        .catch(err => {
          clearTimeout(timer);
          unsub();
          reject(err);
        });
    });
  }

  private async abortQueued(job: JobRecord): Promise<void> {
    await this.store.releaseInFlight(job.cacheKey, job.id);
    await this.store.remove(job.id);
  }

  private async completeFromCache(
    req: DownloadRequest,
    cacheKey: string,
  ): Promise<JobRecord | null> {
    const cachedPath = await findCacheFile(
      cacheDir(this.env.TMP_DIR),
      cacheKey,
      req.format,
    );
    if (!cachedPath) return null;
    await touchFile(cachedPath);
    const job: JobRecord = {
      id: randomUUID(),
      cacheKey,
      stage: 'complete',
      percent: 100,
      message: 'Using cached extract',
      cached: true,
      filePath: cachedPath,
      filename: path.basename(cachedPath),
      request: req,
      updatedAt: Date.now(),
    };
    await this.store.save(job);
    await this.store.publish(job);
    return job;
  }

  private async liveJob(id: string): Promise<JobRecord | null> {
    const job = await this.store.get(id);
    if (job && job.stage !== 'error' && job.stage !== 'complete') return job;
    return null;
  }

  private async run(initial: JobRecord): Promise<void> {
    let job = initial;
    const emit = async (patch: Partial<JobRecord>) => {
      job = {...job, ...patch, updatedAt: Date.now()};
      await this.store.publish(job);
    };
    try {
      await emit({
        stage: 'downloading',
        percent: 0,
        message: 'Starting yt-dlp',
      });
      const file = await this.ytdlp.downloadToFile(job.request, {
        cacheKey: job.cacheKey,
        onProgress: event => {
          void emit({
            stage: event.stage,
            percent:
              event.percent == null
                ? job.percent
                : Math.max(job.percent, event.percent),
            message: event.message,
          });
        },
      });
      await emit({
        stage: 'complete',
        percent: 100,
        cached: false,
        message: 'Extract ready',
        filePath: file.filePath,
        filename: file.filename,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'yt-dlp download failed';
      await emit({
        stage: 'error',
        message,
        error: err instanceof YtDlpError ? err.code : 'download_failed',
      });
    } finally {
      await this.store.releaseInFlight(job.cacheKey, job.id);
    }
  }
}
