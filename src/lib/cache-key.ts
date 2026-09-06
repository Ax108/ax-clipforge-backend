import {parseYouTubeId} from './youtube.js';
import type {DownloadRequest} from '../types.js';

/** `full`, `start-end`, or null when the range is invalid (caller must 400). */
export function clipRangeKey(start?: number, end?: number): string | null {
  if (start == null && end == null) return 'full';
  if (start == null || end == null) return null;
  if (start <= 0 && end <= 0) return 'full';
  if (end <= start) return null;
  return `${String(start)}-${String(end)}`;
}

export function cacheKeyFor(req: DownloadRequest): string | null {
  const id = parseYouTubeId(req.url);
  if (!id) return null;
  const range = clipRangeKey(req.start, req.end);
  if (range == null) return null;
  return `${id}_${req.format}_${req.quality}_${range}`;
}
