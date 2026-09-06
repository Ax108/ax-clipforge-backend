import {EventEmitter} from 'node:events';
import type {
  BeginJobResult,
  JobEventHandler,
  JobRecord,
  JobStore,
  JobStoreKind,
} from './job-store.js';

export class MemoryJobStore implements JobStore {
  readonly kind: JobStoreKind = 'memory';
  private readonly jobs = new Map<string, JobRecord>();
  private readonly inflight = new Map<string, string>();
  private readonly bus = new EventEmitter();

  constructor() {
    this.bus.setMaxListeners(50);
  }

  async get(id: string): Promise<JobRecord | null> {
    return this.jobs.get(id) ?? null;
  }

  async save(job: JobRecord): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async remove(id: string): Promise<void> {
    this.jobs.delete(id);
  }

  async inFlightId(cacheKey: string): Promise<string | null> {
    return this.inflight.get(cacheKey) ?? null;
  }

  async beginJob(job: JobRecord): Promise<BeginJobResult> {
    const existingId = this.inflight.get(job.cacheKey);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (existing) return {kind: 'joined', job: existing};
      this.inflight.delete(job.cacheKey);
    }
    this.inflight.set(job.cacheKey, job.id);
    this.jobs.set(job.id, job);
    return {kind: 'started'};
  }

  async releaseInFlight(cacheKey: string, jobId: string): Promise<boolean> {
    if (this.inflight.get(cacheKey) !== jobId) return false;
    this.inflight.delete(cacheKey);
    return true;
  }

  async subscribe(id: string, handler: JobEventHandler): Promise<() => void> {
    const event = channel(id);
    this.bus.on(event, handler);
    return () => {
      this.bus.off(event, handler);
    };
  }

  async publish(job: JobRecord): Promise<void> {
    this.jobs.set(job.id, job);
    this.bus.emit(channel(job.id), job);
  }

  async close(): Promise<void> {
    this.bus.removeAllListeners();
    this.jobs.clear();
    this.inflight.clear();
  }
}

function channel(id: string): string {
  return `job:${id}`;
}
