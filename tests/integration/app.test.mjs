import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { test } from 'vitest';

test('the Next.js home page starts and responds in Spanish', async () => {
  const port = await new Promise((resolve, reject) => {
    const reservation = createServer();
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', () => {
      const { port } = reservation.address();
      reservation.close(() => resolve(port));
    });
  });
  const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `pnpm dev -p ${port}`]
    : ['dev', '-p', String(port)];
  const server = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  server.stdout.on('data', (data) => { output += data.toString(); });
  server.stderr.on('data', (data) => { output += data.toString(); });

  try {
    let response;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (server.exitCode !== null) {
        throw new Error(`Next.js terminó antes de servir la página: ${output}`);
      }
      try {
        response = await fetch(`http://127.0.0.1:${port}/`);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    assert.ok(response, `Next.js no inició en 30 segundos: ${output}`);

    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<html lang="es"/);
    assert.match(html, /MeAI/);
  } finally {
    if (process.platform === 'win32' && server.pid) {
      try {
        execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // The server may have already exited.
      }
    } else {
      server.kill();
    }
  }
});
