export type ByteRange = {start: number; end: number};

/** RFC 7233 bytes range. `all` = send whole file. */
export function parseByteRange(
  header: string | undefined,
  size: number,
): ByteRange | 'all' | 'unsatisfiable' {
  if (!header || header.trim() === '') return 'all';
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return 'unsatisfiable';
  const rawStart = match[1];
  const rawEnd = match[2];
  if (rawStart === '' && rawEnd === '') return 'unsatisfiable';
  if (size <= 0) return 'unsatisfiable';
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'unsatisfiable';
    return {start: Math.max(0, size - suffix), end: size - 1};
  }
  const start = Number(rawStart);
  const end = rawEnd === '' ? size - 1 : Number(rawEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'unsatisfiable';
  if (start >= size || start < 0 || start > end) return 'unsatisfiable';
  return {start, end: Math.min(end, size - 1)};
}
