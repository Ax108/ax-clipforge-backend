import type {MediaFormat} from './lib/formats.js';

export type {MediaFormat};

export interface VideoMetadata {
  id: string;
  url: string;
  title: string;
  duration: number;
  thumbnailUrl: string;
  channel: string;
  availableQualities: string[];
}

export interface DownloadRequest {
  url: string;
  start?: number;
  end?: number;
  format: MediaFormat;
  quality: string;
}

export interface YtDlpDump {
  id?: string;
  title?: string;
  duration?: number;
  thumbnail?: string;
  uploader?: string;
  channel?: string;
  webpage_url?: string;
}
