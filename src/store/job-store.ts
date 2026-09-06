import type {DownloadRequest} from '../types.js';

export type JobStage =
  | 'queued'
  | 'downloading'
  | 'merging'
  | 'complete'
  | 'error';

export type JobRecord = {
  id: string;
  cacheKey: string;
  stage: JobStage;
  percent: number;
  message: string;
  cached: boolean;
  error?: string;
  filePath?: string;
  filename?: string;
  request: DownloadRequest;
  updatedAt: number;
};

export type JobEventHandler = (job: JobRecord) => void;

export type JobStoreKind = 'memory' | 'redis';

export type BeginJobResult =
  | {kind: 'started'}
  | {kind: 'joined'; job: JobRecord};

export interface JobStore {
  readonly kind: JobStoreKind;
  get(id: string): Promise<JobRecord | null>;
  save(job: JobRecord): Promise<void>;
  remove(id: string): Promise<void>;
  inFlightId(cacheKey: string): Promise<string | null>;
  beginJob(job: JobRecord): Promise<BeginJobResult>;
  releaseInFlight(cacheKey: string, jobId: string): Promise<boolean>;
  subscribe(id: string, handler: JobEventHandler): Promise<() => void>;
  publish(job: JobRecord): Promise<void>;
  close(): Promise<void>;
}
