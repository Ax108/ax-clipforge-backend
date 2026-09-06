import {captureCommand} from '../lib/bin.js';

/**
 * MediaBunny (@mediabunny/server) is the planned mux/trim/transcode layer.
 * It still uses FFmpeg C libraries via NodeAV — it is not FFmpeg-free.
 * This phase only probes availability. No conversion runs yet.
 */
export async function isMediabunnyAvailable(): Promise<boolean> {
  try {
    await import('mediabunny');
    await import('@mediabunny/server');
    return true;
  } catch {
    return false;
  }
}

export async function isFfmpegAvailable(): Promise<boolean> {
  const out = await captureCommand('ffmpeg', ['-version']);
  return out !== null;
}
