import {timingSafeEqual} from 'node:crypto';
import type {NextFunction, Request, Response} from 'express';

function presentedToken(req: Request): string {
  const header = req.get('x-clipforge-token')?.trim() ?? '';
  if (header) return header;
  const auth = req.get('authorization')?.trim() ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const query = req.query.access_token;
  return typeof query === 'string' ? query.trim() : '';
}

function tokenMatches(expected: string, presented: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** No-op when `token` is empty so local dev stays open. */
export function requireClipforgeToken(token: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!token) {
      next();
      return;
    }
    if (tokenMatches(token, presentedToken(req))) {
      next();
      return;
    }
    res.status(401).json({
      error: 'unauthorized',
      message: 'Missing or invalid access token',
    });
  };
}
