import {describe, expect, it} from '@jest/globals';
import {ytdlpFormatArgs} from '../lib/formats.js';
import {isLinkPreviewCrawler} from '../lib/crawler.js';
import {parseTimeToSeconds, parseYouTubeId} from '../lib/youtube.js';

describe('parseYouTubeId', () => {
  it('accepts watch URLs and raw ids', () => {
    expect(parseYouTubeId('dQw4w9wgGcQ')).toBe('dQw4w9wgGcQ');
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9wgGcQ')).toBe(
      'dQw4w9wgGcQ',
    );
    expect(parseYouTubeId('https://youtu.be/dQw4w9wgGcQ')).toBe('dQw4w9wgGcQ');
    expect(parseYouTubeId('https://www.youtube.com/shorts/dQw4w9wgGcQ')).toBe(
      'dQw4w9wgGcQ',
    );
    expect(parseYouTubeId('not-a-youtube-id')).toBeNull();
  });

  it('rejects lookalike hosts that only contain youtube.com as a substring', () => {
    expect(
      parseYouTubeId('https://notyoutube.com/watch?v=dQw4w9wgGcQ'),
    ).toBeNull();
    expect(
      parseYouTubeId('https://youtube.com.evil.example/watch?v=dQw4w9wgGcQ'),
    ).toBeNull();
    expect(
      parseYouTubeId('https://evil.example/youtube.com/watch?v=dQw4w9wgGcQ'),
    ).toBeNull();
  });
});

describe('parseTimeToSeconds', () => {
  it('parses seconds and HH:MM:SS', () => {
    expect(parseTimeToSeconds('90')).toBe(90);
    expect(parseTimeToSeconds('01:30')).toBe(90);
  });
});

describe('ytdlpFormatArgs', () => {
  it('builds mp4 height caps and audio extract flags', () => {
    expect(ytdlpFormatArgs('mp4', '720p')).toEqual([
      '-f',
      'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
      '--merge-output-format',
      'mp4',
    ]);
    expect(ytdlpFormatArgs('mp3', '128kbps')).toEqual([
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '128K',
    ]);
    expect(ytdlpFormatArgs('mp3', '256kbps')).toEqual([
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '256K',
    ]);
    expect(ytdlpFormatArgs('mp3', '320kbps')).toEqual([
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '320K',
    ]);
    expect(ytdlpFormatArgs('flac', 'best')).toEqual([
      '-x',
      '--audio-format',
      'flac',
      '--audio-quality',
      '0',
    ]);
    expect(ytdlpFormatArgs('mp3', 'best')).not.toEqual(
      ytdlpFormatArgs('mp3', '320kbps'),
    );
    expect(() => ytdlpFormatArgs('mp3', '64kbps')).toThrow(
      'invalid audio quality',
    );
  });
});

describe('isLinkPreviewCrawler', () => {
  it('blocks Facebook preview agents', () => {
    expect(isLinkPreviewCrawler('facebookexternalhit/1.1')).toBe(true);
    expect(isLinkPreviewCrawler('Mozilla/5.0')).toBe(false);
  });
});
