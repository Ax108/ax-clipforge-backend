import {describe, expect, it} from '@jest/globals';
import {EventEmitter} from 'node:events';
import {createReadStream, rmSync} from 'node:fs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import type {Request, Response} from 'express';
import {pipeFile} from '../lib/send-file.js';

describe('pipeFile', () => {
  it('destroys the response when the read stream errors after headers', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'clipforge-send-'));
    const req = new EventEmitter() as unknown as Request;
    let destroyed = false;
    const res = new EventEmitter() as unknown as Response;
    Object.assign(res, {
      writableEnded: false,
      headersSent: true,
      destroy: () => {
        destroyed = true;
        return res;
      },
      status() {
        return res;
      },
      end() {
        return res;
      },
    });

    await new Promise<void>(resolve => {
      res.destroy = () => {
        destroyed = true;
        resolve();
        return res;
      };
      pipeFile(req, res, createReadStream(dir));
      setTimeout(resolve, 250);
    });
    rmSync(dir, {recursive: true, force: true});
    expect(destroyed).toBe(true);
  });

  it('clears Content-Length before a 404 if headers are not flushed yet', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'clipforge-send-404-'));
    const req = new EventEmitter() as unknown as Request;
    const headers: Record<string, string> = {
      'Content-Length': '999999',
      'Content-Disposition': 'attachment; filename="x.mp4"',
    };
    let statusCode = 0;
    let body = '';
    const res = new EventEmitter() as unknown as Response;
    Object.assign(res, {
      writableEnded: false,
      headersSent: false,
      removeHeader(name: string) {
        delete headers[name];
      },
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      status(code: number) {
        statusCode = code;
        return res;
      },
      end(payload?: string) {
        body = payload ?? '';
        return res;
      },
      destroy() {
        return res;
      },
    });

    await new Promise<void>(resolve => {
      const origEnd = res.end.bind(res);
      res.end = ((payload?: string) => {
        origEnd(payload);
        resolve();
        return res;
      }) as Response['end'];
      pipeFile(req, res, createReadStream(dir));
      setTimeout(resolve, 250);
    });
    rmSync(dir, {recursive: true, force: true});
    expect(statusCode).toBe(404);
    expect(headers['Content-Length']).toBeUndefined();
    expect(body).toContain('file_gone');
  });
});
