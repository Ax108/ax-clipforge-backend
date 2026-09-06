import {captureCommand} from '../lib/bin.js';

export async function isFfmpegAvailable(): Promise<boolean> {
  const out = await captureCommand('ffmpeg', ['-version']);
  return out !== null;
}
