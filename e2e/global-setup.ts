import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

let worker: ChildProcess | null = null;

/** Starts the background worker alongside the API/web servers started by Playwright. */
export default async function globalSetup() {
  worker = spawn(process.execPath, ['dist/worker.js'], {
    cwd: resolve(__dirname, '../apps/api'),
    stdio: 'ignore',
    windowsHide: true,
  });
}

export async function teardown() {
  if (!worker?.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(worker.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    worker.kill('SIGTERM');
  }
  worker = null;
}
