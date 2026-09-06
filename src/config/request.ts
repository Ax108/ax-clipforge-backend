import {z} from 'zod';
import {
  MEDIA_FORMATS,
  defaultQualityForFormat,
  parseMediaQuality,
} from '../lib/formats.js';
import {parseTimeToSeconds} from '../lib/youtube.js';

function optionalTime(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.floor(value) : value;
  }
  if (typeof value === 'string') {
    const parsed = parseTimeToSeconds(value);
    return parsed == null ? value : Math.floor(parsed);
  }
  return value;
}

export const infoRequestSchema = z.object({
  url: z.string().trim().min(1),
});

export const downloadRequestSchema = z
  .object({
    url: z.string().trim().min(1),
    format: z.enum(MEDIA_FORMATS).default('mp4'),
    quality: z.string().trim().optional(),
    start: z.preprocess(optionalTime, z.number().nonnegative().optional()),
    end: z.preprocess(optionalTime, z.number().nonnegative().optional()),
  })
  .transform(data => {
    const raw = data.quality?.trim() ? data.quality : undefined;
    return {
      ...data,
      quality: raw ?? defaultQualityForFormat(data.format),
    };
  })
  .superRefine((data, ctx) => {
    if (!parseMediaQuality(data.format, data.quality)) {
      ctx.addIssue({
        code: 'custom',
        path: ['quality'],
        message:
          data.format === 'mp4'
            ? 'quality must be a height like 1080p'
            : 'quality must be best, 128kbps, 256kbps, or 320kbps',
      });
    }
    const hasStart = data.start !== undefined;
    const hasEnd = data.end !== undefined;
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: 'custom',
        path: hasStart ? ['end'] : ['start'],
        message: 'start and end are both required to clip',
      });
      return;
    }
    if (!hasStart || !hasEnd) return;
    const start = data.start;
    const end = data.end;
    if (start === undefined || end === undefined) return;
    if (start === 0 && end === 0) return;
    if (end <= start) {
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'end must be greater than start',
      });
    }
  })
  .transform(data => ({
    ...data,
    quality: parseMediaQuality(data.format, data.quality) ?? data.quality,
  }));
