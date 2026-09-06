const YT_ID_RE = /^[\w-]{11}$/;

function isYouTubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'youtu.be' || host === 'www.youtu.be') return true;
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) return true;
  if (
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube-nocookie.com')
  ) {
    return true;
  }
  return false;
}

export function parseYouTubeId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (YT_ID_RE.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!isYouTubeHost(url.hostname)) return null;

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && YT_ID_RE.test(id) ? id : null;
  }

  const v = url.searchParams.get('v');
  if (v && YT_ID_RE.test(v)) return v;

  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts.length >= 2 &&
    (parts[0] === 'shorts' ||
      parts[0] === 'embed' ||
      parts[0] === 'live' ||
      parts[0] === 'v')
  ) {
    return YT_ID_RE.test(parts[1]) ? parts[1] : null;
  }
  return null;
}

export function watchUrlForId(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function parseTimeToSeconds(value: string): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v);
  const parts = v.split(':').map(p => p.trim());
  if (parts.some(p => p === '' || !/^\d+(\.\d+)?$/.test(p))) return null;
  let secs = 0;
  for (const part of parts) secs = secs * 60 + parseFloat(part);
  return secs;
}
