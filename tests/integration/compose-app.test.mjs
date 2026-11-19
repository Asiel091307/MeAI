import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'vitest';

const exec = promisify(execFile);

test('the application runs in Compose and reaches PostgreSQL', async () => {
  // Use the developer's .env password when there is one: an explicit POSTGRES_PASSWORD wins over
  // .env in Compose, and the wrong one would recreate the local app unable to log in to its volume.
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env (CI): a throwaway password is fine for a fresh volume.
  }
  const env = {
    ...process.env,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? 'test-only-password',
  };
  const compose = async (...args) => (await exec('docker', ['compose', ...args], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    // The first production build (install, next build, OCR data) takes several minutes.
    timeout: 900_000,
  })).stdout;

  assert.match(await compose('config', '--services'), /^app$/m);
  await compose('up', '-d', '--build', '--wait', 'app');

  const response = await fetch('http://127.0.0.1:3000/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /MeAI/);

  const probe = `
    const socket = require('node:net').connect({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
    });
    socket.setTimeout(5000);
    socket.on('connect', () => {
      const request = Buffer.alloc(8);
      request.writeUInt32BE(8, 0);
      request.writeUInt32BE(80877103, 4);
      socket.write(request);
    });
    socket.on('data', (answer) => {
      if (answer[0] !== 83 && answer[0] !== 78) process.exitCode = 1;
      else console.log('postgres reachable');
      socket.end();
    });
    socket.on('error', (error) => { console.error(error); process.exitCode = 1; });
    socket.on('timeout', () => { socket.destroy(new Error('PostgreSQL did not respond')); });
  `;
  assert.match(await compose('exec', '-T', 'app', 'node', '-e', probe), /postgres reachable/);
}, 960_000);
