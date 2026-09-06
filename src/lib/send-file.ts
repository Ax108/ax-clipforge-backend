import {createReadStream, type ReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import type {Request, Response} from 'express';
import {parseByteRange} from './range.js';

export async function sendAttachment(
  req: Request,
  res: Response,
  filePath: string,
  mime: string,
  filename: string,
): Promise<void> {
  const info = await stat(filePath);
  const size = info.size;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

  const range = parseByteRange(req.get('range'), size);
  if (range === 'unsatisfiable') {
    res.setHeader('Content-Range', `bytes */${String(size)}`);
    res.status(416).end();
    return;
  }

  if (range === 'all') {
    res.setHeader('Content-Length', String(size));
    pipeFile(req, res, createReadStream(filePath));
    return;
  }

  res.status(206);
  res.setHeader(
    'Content-Range',
    `bytes ${String(range.start)}-${String(range.end)}/${String(size)}`,
  );
  res.setHeader('Content-Length', String(range.end - range.start + 1));
  pipeFile(
    req,
    res,
    createReadStream(filePath, {start: range.start, end: range.end}),
  );
}

export function pipeFile(
  req: Request,
  res: Response,
  stream: ReadStream,
): void {
  const fail = () => {
    stream.destroy();
    if (res.writableEnded) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.removeHeader('Content-Length');
    res.removeHeader('Content-Range');
    res.removeHeader('Content-Disposition');
    res.removeHeader('Accept-Ranges');
    res.status(404);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({error: 'file_gone'}));
  };
  stream.on('error', fail);
  req.on('close', () => {
    stream.destroy();
  });
  stream.pipe(res);
}

function contentDisposition(filename: string): string {
  const safe = filename.replace(/["\r\n]/g, '_');
  return `attachment; filename="${safe}"`;
}
