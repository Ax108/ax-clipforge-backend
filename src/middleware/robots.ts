import type {NextFunction, Request, Response} from 'express';

/** Plain robots.txt: disallow all crawlers from indexing this API host. */
export const ROBOTS_TXT_BODY = ['User-agent: *', 'Disallow: /', ''].join('\n');

const SEARCH_ENGINE_BLOCK_HEADER = 'noindex, nofollow, noarchive, nosnippet';

/** Defense in depth with robots.txt — set on every API response. */
export function blockSearchIndexing(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('X-Robots-Tag', SEARCH_ENGINE_BLOCK_HEADER);
  next();
}
