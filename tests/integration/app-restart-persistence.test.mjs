import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { test } from 'vitest';
import { createBlankPdf } from '../helpers/pdf-fixtures';

const exec = promisify(execFile);

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const reservation = createServer();
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', () => {
      const { port } = reservation.address();
      reservation.close(() => resolve(port));
    });
  });
}

function startNextApp(port, dbEnv) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `pnpm dev -p ${port}`]
    : ['dev', '-p', String(port)];

  const server = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      ...dbEnv,
    },
  });

  let output = '';
  server.stdout?.on('data', (chunk) => { output += chunk.toString(); });
  server.stderr?.on('data', (chunk) => { output += chunk.toString(); });

  const stop = () => {
    if (process.platform === 'win32' && server.pid) {
      try {
        execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // Process might already be stopped
      }
    } else {
      server.kill();
    }
  };

  const waitUntilReady = async (maxAttempts = 60) => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (server.exitCode !== null) {
        throw new Error(`Next.js terminó inesperadamente: ${output}`);
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/documents`);
        if (res.ok) return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw new Error(`Next.js en puerto ${port} no respondió en 30s: ${output}`);
  };

  return { server, stop, waitUntilReady };
}

test('PDF and document metadata persist in PostgreSQL across application restarts (T37)', async () => {
  const container = `meai_t37_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const distDir = `.next-test-${randomUUID().slice(0, 8)}`;
  // `next dev` adds the custom distDir to these two files; restore them when the test ends.
  const nextManagedFiles = ['tsconfig.json', 'next-env.d.ts'];
  const originalContents = await Promise.all(nextManagedFiles.map((file) => readFile(file, 'utf8')));
  await exec('docker', [
    'run', '-d', '--rm', '--name', container,
    '-e', 'POSTGRES_DB=meai', '-e', 'POSTGRES_USER=meai',
    '-e', 'POSTGRES_PASSWORD=test-only-password',
    '-p', '127.0.0.1::5432', 'pgvector/pgvector:0.8.1-pg17',
  ], { timeout: 30_000 });

  let pool;
  let firstApp;
  let secondApp;

  try {
    const { stdout } = await exec('docker', ['port', container, '5432/tcp'], { timeout: 30_000 });
    const dbPort = Number(/127\.0\.0\.1:(\d+)/.exec(stdout)?.[1]);
    assert.ok(dbPort > 0, `No local database port found: ${stdout}`);

    pool = new Pool({
      host: '127.0.0.1',
      port: dbPort,
      user: 'meai',
      database: 'meai',
      password: 'test-only-password',
      connectionTimeoutMillis: 1000,
    });

    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        await pool.query('SELECT 1');
        break;
      } catch (err) {
        if (attempt === 119) throw err;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    for (const file of ['001_create_documents.sql', '002_create_document_versions.sql']) {
      const migration = await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8');
      await pool.query(migration);
    }

    const dbEnv = {
      DB_HOST: '127.0.0.1',
      DB_PORT: String(dbPort),
      DB_USER: 'meai',
      DB_NAME: 'meai',
      DB_PASSWORD: 'test-only-password',
      // Own build folder: another test may be running `next dev` on `.next` at the same time.
      NEXT_DIST_DIR: distDir,
    };

    // 1. Start application (first instance)
    const port1 = await findAvailablePort();
    firstApp = startNextApp(port1, dbEnv);
    await firstApp.waitUntilReady();

    // 2. Upload a PDF via POST /api/documents on first instance
    const pdfBytes = createBlankPdf(2);
    const formData = new FormData();
    formData.append('file', new Blob([Buffer.from(pdfBytes)], { type: 'application/pdf' }), 'informe-anual.pdf');

    const postRes = await fetch(`http://127.0.0.1:${port1}/api/documents`, {
      method: 'POST',
      body: formData,
    });
    assert.equal(postRes.status, 201);
    const postBody = await postRes.json();
    assert.ok(postBody.document?.id);
    const documentId = postBody.document.id;
    assert.equal(postBody.document.name, 'informe-anual.pdf');
    assert.equal(postBody.document.status, 'processing');

    // 3. Stop first application instance (simulating restart)
    firstApp.stop();
    firstApp = undefined;
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 4. Start application again (second instance, simulating restart with fresh process)
    const port2 = await findAvailablePort();
    secondApp = startNextApp(port2, dbEnv);
    await secondApp.waitUntilReady();

    // 5. Query GET /api/documents on second instance after restart
    const getRes = await fetch(`http://127.0.0.1:${port2}/api/documents`);
    assert.equal(getRes.status, 200);
    const getBody = await getRes.json();
    assert.ok(Array.isArray(getBody.documents));
    const foundDoc = getBody.documents.find((d) => d.id === documentId);
    assert.ok(foundDoc, 'Document was not found after restarting the application');
    assert.equal(foundDoc.name, 'informe-anual.pdf');
    assert.equal(foundDoc.status, 'processing');

    // 6. Verify exact PDF binary bytes survived in PostgreSQL
    const dbRow = await pool.query('SELECT pdf_bytes FROM documents WHERE id = $1', [documentId]);
    assert.equal(dbRow.rows.length, 1);
    const storedBuffer = dbRow.rows[0].pdf_bytes;
    assert.deepEqual(Uint8Array.from(storedBuffer), pdfBytes);

  } finally {
    if (firstApp) firstApp.stop();
    if (secondApp) secondApp.stop();
    await rm(distDir, { recursive: true, force: true });
    await Promise.all(nextManagedFiles.map((file, index) => writeFile(file, originalContents[index])));
    if (pool) await pool.end();
    await exec('docker', ['stop', container], { timeout: 30_000 });
  }
}, 240_000);

