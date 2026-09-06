import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import type {AppEnv} from '../config/env.js';
import {spawnCommand} from '../lib/bin.js';
import {cacheDir, findCacheFile} from '../lib/cache-files.js';
import {cacheKeyFor} from '../lib/cache-key.js';
import {ytdlpFormatArgs} from '../lib/formats.js';
import {parseYtDlpLine} from '../lib/progress.js';
import {Semaphore} from '../lib/semaphore.js';
import {isPathInside} from '../lib/tmp.js';
import {parseYouTubeId, watchUrlForId} from '../lib/youtube.js';
import type {DownloadRequest, VideoMetadata, YtDlpDump} from '../types.js';

export class YtDlpError extends Error {
  readonly code:
    | 'unavailable'
    | 'invalid_url'
    | 'extract_failed'
    | 'download_failed';

  constructor(
    message: string,
    code: 'unavailable' | 'invalid_url' | 'extract_failed' | 'download_failed',
  ) {
    super(message);
    this.name = 'YtDlpError';
    this.code = code;
  }
}

export type YtDlpProgressEvent = {
  stage: 'downloading' | 'merging';
  percent?: number;
  message: string;
  speed?: string;
  eta?: string;
};

export class YtDlpService {
  private readonly env: AppEnv;
  private readonly lock: Semaphore;
  private readonly bin: string;

  constructor(env: AppEnv) {
    this.env = env;
    this.lock = new Semaphore(env.DOWNLOAD_CONCURRENCY);
    this.bin = env.YTDLP_BIN;
  }

  tmpConfig(): {dir: string; keepTmp: boolean; maxAgeMs: number} {
    return {
      dir: this.env.TMP_DIR,
      keepTmp: this.env.KEEP_TMP,
      maxAgeMs: this.env.TMP_MAX_AGE_MS,
    };
  }

  extraArgs(): string[] {
    const args = [
      '--no-warnings',
      '--no-playlist',
      '--restrict-filenames',
      '--referer',
      'https://www.youtube.com/',
    ];
    if (this.env.PROXY_URL) {
      args.push('--proxy', this.env.PROXY_URL);
    }
    if (this.env.COOKIE_FILE_PATH) {
      args.push('--cookies', this.env.COOKIE_FILE_PATH);
    }
    if (this.env.PO_TOKEN) {
      args.push('--extractor-args', `youtube:po_token=${this.env.PO_TOKEN}`);
    }
    return args;
  }

  async isAvailable(): Promise<boolean> {
    return (await this.version()) !== null;
  }

  async version(): Promise<string | null> {
    const result = await spawnCommand(this.bin, ['--version']);
    return result.code === 0 ? result.stdout.trim() : null;
  }

  async probe(url: string): Promise<VideoMetadata> {
    const id = parseYouTubeId(url);
    if (!id) {
      throw new YtDlpError('Invalid YouTube URL', 'invalid_url');
    }
    if (!(await this.isAvailable())) {
      throw new YtDlpError('yt-dlp is not installed', 'unavailable');
    }

    const dump = await this.lock.run(() => this.dumpJson(watchUrlForId(id)));
    return this.toMetadata(id, dump);
  }

  async downloadToFile(
    req: DownloadRequest,
    opts?: {
      cacheKey?: string;
      onProgress?: (event: YtDlpProgressEvent) => void;
    },
  ): Promise<{
    filePath: string;
    filename: string;
    cacheKey: string;
  }> {
    const id = parseYouTubeId(req.url);
    if (!id) {
      throw new YtDlpError('Invalid YouTube URL', 'invalid_url');
    }
    if (!(await this.isAvailable())) {
      throw new YtDlpError('yt-dlp is not installed', 'unavailable');
    }

    const key = opts?.cacheKey ?? cacheKeyFor(req);
    if (!key) {
      throw new YtDlpError('Invalid YouTube URL', 'invalid_url');
    }

    const outDir = cacheDir(this.env.TMP_DIR);
    await mkdir(outDir, {recursive: true});
    const outTemplate = path.join(outDir, `${key}.%(ext)s`);

    const onLine = (line: string) => {
      if (!opts?.onProgress) return;
      const parsed = parseYtDlpLine(line);
      if (parsed) opts.onProgress(parsed);
    };

    const args = [
      ...this.extraArgs(),
      '--newline',
      '--progress',
      '--continue',
      ...ytdlpFormatArgs(req.format, req.quality),
      '--print',
      'after_move:filepath',
      '-o',
      outTemplate,
      ...sectionArgs(req.start, req.end),
      watchUrlForId(id),
    ];

    const result = await this.lock.run(() =>
      spawnCommand(this.bin, args, {
        timeoutMs: this.env.DOWNLOAD_TIMEOUT_MS,
        cwd: outDir,
        onStdoutLine: onLine,
        onStderrLine: onLine,
      }),
    );

    if (result.code !== 0) {
      throw new YtDlpError(
        result.stderr.trim() || 'yt-dlp download failed',
        'download_failed',
      );
    }

    const printed = pickOutputPath(result.stdout, outDir);
    const filePath = printed ?? (await findCacheFile(outDir, key, req.format));
    if (
      !filePath ||
      !isPathInside(outDir, filePath) ||
      path.extname(filePath).slice(1).toLowerCase() !== req.format
    ) {
      throw new YtDlpError(
        'yt-dlp did not report an output file',
        'download_failed',
      );
    }

    return {
      filePath,
      filename: path.basename(filePath),
      cacheKey: key,
    };
  }

  private async dumpJson(url: string): Promise<YtDlpDump> {
    const result = await spawnCommand(
      this.bin,
      [...this.extraArgs(), '--dump-single-json', '--skip-download', url],
      {timeoutMs: this.env.DOWNLOAD_TIMEOUT_MS},
    );
    if (result.code !== 0) {
      throw new YtDlpError(
        result.stderr.trim() || 'yt-dlp info failed',
        'extract_failed',
      );
    }
    try {
      return JSON.parse(result.stdout) as YtDlpDump;
    } catch {
      throw new YtDlpError('yt-dlp returned invalid JSON', 'extract_failed');
    }
  }

  private toMetadata(id: string, dump: YtDlpDump): VideoMetadata {
    return {
      id: dump.id || id,
      url: dump.webpage_url || watchUrlForId(id),
      title: dump.title || 'YouTube video',
      duration: typeof dump.duration === 'number' ? dump.duration : 0,
      thumbnailUrl:
        dump.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      channel: dump.channel || dump.uploader || '',
      availableQualities: ['1080p', '720p', '480p'],
    };
  }
}

function sectionArgs(start?: number, end?: number): string[] {
  if (start == null || end == null) return [];
  const from = Math.floor(start);
  const to = Math.floor(end);
  if (to <= from) return [];
  if (from <= 0 && to <= 0) return [];
  return [
    '--download-sections',
    `*${String(from)}-${String(to)}`,
    '--force-keyframes-at-cuts',
  ];
}

function pickOutputPath(text: string, root: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line && isPathInside(root, line)) return path.resolve(line);
  }
  return null;
}
