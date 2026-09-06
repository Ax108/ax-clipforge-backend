import type {Request, Response} from 'express';
import type {YtDlpService} from '../services/ytdlp.service.js';
import {
  isFfmpegAvailable,
  isMediabunnyAvailable,
} from '../services/media.service.js';

export async function health(
  ytdlp: YtDlpService,
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
  });
}

export function notImplemented(_req: Request, res: Response): void {
  res.status(501).json({status: 'not_implemented'});
}
