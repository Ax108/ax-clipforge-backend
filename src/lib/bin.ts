import {spawn} from 'node:child_process';

/** Probe a binary without execa so Jest can run in CJS. Download spawning will use execa later. */
export function captureCommand(
  command: string,
  args: string[],
): Promise<string | null> {
  return new Promise(resolve => {
    const child = spawn(command, args, {windowsHide: true});
    let stdout = '';
    child.stdout?.on('data', chunk => {
      stdout += String(chunk);
    });
    child.on('error', () => {
      resolve(null);
    });
    child.on('close', code => {
      resolve(code === 0 ? stdout.trim() : null);
    });
  });
}
