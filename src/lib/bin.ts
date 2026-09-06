import {spawn} from 'node:child_process';

/** Probe a binary without execa so Jest can run in CJS. */
export function captureCommand(
  command: string,
  args: string[],
): Promise<string | null> {
  return spawnCommand(command, args).then(result =>
    result.code === 0 ? result.stdout.trim() : null,
  );
}

export type SpawnResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

export type SpawnOptions = {
  timeoutMs?: number;
  cwd?: string;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
};

export function spawnCommand(
  command: string,
  args: string[],
  opts?: SpawnOptions,
): Promise<SpawnResult> {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      windowsHide: true,
      cwd: opts?.cwd,
    });
    let stdout = '';
    let stderr = '';
    const timer =
      opts?.timeoutMs != null
        ? setTimeout(() => {
            child.kill();
          }, opts.timeoutMs)
        : undefined;

    attachLines(child.stdout, opts?.onStdoutLine, chunk => {
      stdout += chunk;
    });
    attachLines(child.stderr, opts?.onStderrLine, chunk => {
      stderr += chunk;
    });
    child.on('error', err => {
      if (timer) clearTimeout(timer);
      resolve({code: null, stdout, stderr: err.message});
    });
    child.on('close', code => {
      if (timer) clearTimeout(timer);
      resolve({code, stdout, stderr});
    });
  });
}

function attachLines(
  stream: NodeJS.ReadableStream | null,
  onLine: ((line: string) => void) | undefined,
  collect: (chunk: string) => void,
): void {
  if (!stream) return;
  let buffer = '';
  stream.on('data', chunk => {
    const text = String(chunk);
    collect(text);
    if (!onLine) return;
    buffer += text;
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      if (line.trim()) onLine(line);
    }
  });
  stream.on('end', () => {
    if (onLine && buffer.trim()) onLine(buffer);
  });
}
