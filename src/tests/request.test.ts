import {describe, expect, it} from '@jest/globals';
import {audioRequestSchema, downloadRequestSchema} from '../config/request.js';
import {cacheKeyFor} from '../lib/cache-key.js';

describe('downloadRequestSchema', () => {
  const url = 'https://www.youtube.com/watch?v=dQw4w9wgGcQ';

  it('requires both start and end to clip, and end greater than start', () => {
    expect(downloadRequestSchema.safeParse({url, start: 10}).success).toBe(
      false,
    );
    expect(downloadRequestSchema.safeParse({url, end: 10}).success).toBe(false);
    expect(
      downloadRequestSchema.safeParse({url, start: 30, end: 10}).success,
    ).toBe(false);
    expect(
      downloadRequestSchema.safeParse({url, start: 0, end: 30}).success,
    ).toBe(true);
    expect(
      downloadRequestSchema.safeParse({url, start: 0, end: 0}).success,
    ).toBe(true);
  });

  it('floors clip times so cache key and yt-dlp see the same seconds', () => {
    const parsed = downloadRequestSchema.parse({
      url,
      start: 0.9,
      end: 30.1,
    });
    expect(parsed.start).toBe(0);
    expect(parsed.end).toBe(30);
  });

  it('rejects quality strings that would collide or uncap the selector', () => {
    expect(
      downloadRequestSchema.safeParse({url, format: 'mp4', quality: '720p!'})
        .success,
    ).toBe(false);
    expect(
      downloadRequestSchema.safeParse({url, format: 'mp4', quality: 'best'})
        .success,
    ).toBe(false);
    expect(
      downloadRequestSchema.parse({url, format: 'mp4', quality: '720P'})
        .quality,
    ).toBe('720p');
    expect(
      downloadRequestSchema.parse({url, format: 'm4a', quality: 'best'})
        .quality,
    ).toBe('best');
    expect(
      downloadRequestSchema.safeParse({url, format: 'mp3', quality: '64kbps'})
        .success,
    ).toBe(false);
    expect(
      downloadRequestSchema.safeParse({
        url,
        format: 'mp3',
        quality: '999999kbps',
      }).success,
    ).toBe(false);
  });

  it('defaults audio quality when format is not mp4', () => {
    expect(downloadRequestSchema.parse({url, format: 'mp3'}).quality).toBe(
      '320kbps',
    );
    expect(downloadRequestSchema.parse({url, format: 'flac'}).quality).toBe(
      'best',
    );
  });
});

describe('audioRequestSchema', () => {
  const url = 'https://www.youtube.com/watch?v=dQw4w9wgGcQ';

  it('defaults to mp3 at 320kbps and rejects video format', () => {
    const parsed = audioRequestSchema.parse({url});
    expect(parsed.format).toBe('mp3');
    expect(parsed.quality).toBe('320kbps');
    expect(audioRequestSchema.safeParse({url, format: 'mp4'}).success).toBe(
      false,
    );
    expect(audioRequestSchema.parse({url, format: 'm4a'}).quality).toBe('best');
    expect(audioRequestSchema.parse({url, format: 'flac'}).quality).toBe(
      'best',
    );
  });

  it('uses the same clip, quality, and cache-key rules as download audio', () => {
    expect(audioRequestSchema.safeParse({url, start: 10}).success).toBe(false);
    expect(
      audioRequestSchema.safeParse({url, start: 30, end: 10}).success,
    ).toBe(false);
    expect(audioRequestSchema.safeParse({url, quality: '64kbps'}).success).toBe(
      false,
    );
    expect(audioRequestSchema.safeParse({url, quality: '1080p'}).success).toBe(
      false,
    );

    const audio = audioRequestSchema.parse({
      url,
      start: 0.9,
      end: 30.1,
    });
    const viaDownload = downloadRequestSchema.parse({
      url,
      format: 'mp3',
      start: 0.9,
      end: 30.1,
    });
    expect(audio.start).toBe(0);
    expect(audio.end).toBe(30);
    expect(cacheKeyFor(audio)).toBe(cacheKeyFor(viaDownload));
    expect(cacheKeyFor(audioRequestSchema.parse({url}))).toBe(
      cacheKeyFor(downloadRequestSchema.parse({url, format: 'mp3'})),
    );
    expect(cacheKeyFor(audioRequestSchema.parse({url}))).toBe(
      'dQw4w9wgGcQ_mp3_320kbps_full',
    );
  });
});
