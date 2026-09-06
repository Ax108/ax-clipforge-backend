import type {AppEnv} from '../config/env.js';
import {captureCommand} from '../lib/bin.js';

/**
 * yt-dlp wrapper. This phase only probes the binary and builds anti-bot args.
 * It does not download or extract.
 */
export class YtDlpService {
  private readonly env: AppEnv;

  constructor(env: AppEnv) {
    this.env = env;
  }

  extraArgs(): string[] {
    const args = ['--no-warnings'];
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
    return captureCommand('yt-dlp', ['--version']);
  }
}
