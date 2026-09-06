export type YtDlpStage = 'downloading' | 'merging';

export type ParsedYtDlpLine = {
  stage: YtDlpStage;
  percent?: number;
  message: string;
  speed?: string;
  eta?: string;
};

const DOWNLOAD_PCT = /\[download\]\s+(\d+(?:\.\d+)?)%/;
const SPEED = /\bat\s+(\S+)(?:\s|$)/;
const ETA = /\bETA\s+(\S+)/;
const MERGE = /\[(?:Merger|ExtractAudio|Fixup[^\]]*)\]/;

/** Map one yt-dlp stderr/stdout line to a real extract stage. */
export function parseYtDlpLine(line: string): ParsedYtDlpLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (MERGE.test(trimmed)) {
    return {stage: 'merging', percent: 95, message: clip(trimmed)};
  }
  const pct = DOWNLOAD_PCT.exec(trimmed);
  if (pct) {
    return {
      stage: 'downloading',
      percent: Math.min(100, Number(pct[1])),
      message: clip(trimmed),
      speed: SPEED.exec(trimmed)?.[1],
      eta: ETA.exec(trimmed)?.[1],
    };
  }
  if (trimmed.startsWith('[download]')) {
    return {stage: 'downloading', message: clip(trimmed)};
  }
  return null;
}

function clip(text: string): string {
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}
