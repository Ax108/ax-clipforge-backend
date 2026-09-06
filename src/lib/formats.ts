export const MEDIA_FORMATS = ['mp4', 'mp3', 'm4a', 'flac'] as const;
export type MediaFormat = (typeof MEDIA_FORMATS)[number];

export const AUDIO_FORMATS = ['mp3', 'm4a', 'flac'] as const;

export const AUDIO_QUALITIES = [
  'best',
  '128kbps',
  '256kbps',
  '320kbps',
] as const;

export function isMediaFormat(value: string): value is MediaFormat {
  return (MEDIA_FORMATS as readonly string[]).includes(value);
}

export function defaultQualityForFormat(format: MediaFormat): string {
  if (format === 'mp4') return '1080p';
  if (format === 'mp3') return '320kbps';
  return 'best';
}

/** Canonical quality string, or null if it must not reach yt-dlp / the cache key. */
export function parseMediaQuality(
  format: MediaFormat,
  quality: string,
): string | null {
  const q = quality.trim().toLowerCase();
  if (format === 'mp4') {
    const m = /^(\d{3,4})p$/.exec(q);
    if (!m) return null;
    const height = Number(m[1]);
    if (height < 144 || height > 4320) return null;
    return q;
  }
  return (AUDIO_QUALITIES as readonly string[]).includes(q) ? q : null;
}

export function heightFromQuality(quality: string): number | null {
  const m = /^(\d+)p$/.exec(quality);
  return m ? Number(m[1]) : null;
}

function audioQualityArg(quality: string): string {
  if (quality === '128kbps') return '128K';
  if (quality === '256kbps') return '256K';
  if (quality === '320kbps') return '320K';
  if (quality === 'best') return '0';
  throw new Error('invalid audio quality');
}

/** yt-dlp -f / audio extract flags. Merge still uses the ffmpeg binary. */
export function ytdlpFormatArgs(
  format: MediaFormat,
  quality: string,
): string[] {
  if (format === 'mp4') {
    const height = heightFromQuality(quality);
    const spec = height
      ? `bestvideo[height<=${String(height)}]+bestaudio/best[height<=${String(height)}]/best`
      : 'bestvideo+bestaudio/best';
    return ['-f', spec, '--merge-output-format', 'mp4'];
  }

  return [
    '-x',
    '--audio-format',
    format,
    '--audio-quality',
    audioQualityArg(quality),
  ];
}

export function mimeForFormat(format: MediaFormat): string {
  switch (format) {
    case 'mp4':
      return 'video/mp4';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
    case 'flac':
      return 'audio/flac';
  }
}

export function extensionForFormat(format: MediaFormat): string {
  return format;
}
