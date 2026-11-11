// Shared setup for the closing end-to-end tests (T65, T65a): a throwaway pgvector database
// with every migration applied, the real Postgres repositories and route handlers, and a
// deterministic embeddings stand-in so similarity is meaningful without calling Gemini.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { createPostgresChunkRepository } from '../../src/db/postgres-chunks';
import { createPostgresDocumentRepository } from '../../src/db/postgres-documents';
import { createPostgresPublicationRepository } from '../../src/db/postgres-publication';
import { createPostgresReprocessingRepository } from '../../src/db/postgres-reprocessing';
import { createPostgresSearchRepository } from '../../src/db/postgres-search';
import { createPostgresVersionRepository } from '../../src/db/postgres-versions';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';

const exec = promisify(execFile);
const DIMENSIONS = 1536;

// Bag of words: every word of 4+ letters adds weight to one of 1536 positions, so texts that
// share words point in similar directions.
export function wordVector(text) {
  const vector = new Array(DIMENSIONS).fill(0);
  const words = text.toLowerCase().normalize('NFD').replace(/[^a-z\s]/g, '').split(/\s+/);
  for (const word of words) {
    if (word.length < 4) continue;
    let hash = 0;
    for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) % DIMENSIONS;
    vector[hash] += 1;
  }
  vector[DIMENSIONS - 1] += 0.01;
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
}

export const wordEmbeddings = {
  async embed(text) { return wordVector(text); },
  async embedDocuments(texts) { return texts.map(wordVector); },
};

// Applies every migration in db/migrations, in order, like `pnpm migrate`.
async function migrate(pool) {
  const directory = new URL('../../db/migrations/', import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) {
    await pool.query(await readFile(new URL(file, directory), 'utf8'));
  }
}

export async function startMvpEnvironment() {
  const container = `meai_mvp_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  await exec('docker', [
    'run', '-d', '--rm', '--name', container,
    '-e', 'POSTGRES_DB=meai', '-e', 'POSTGRES_USER=meai',
    '-e', 'POSTGRES_PASSWORD=test-only-password',
    '-p', '127.0.0.1::5432', 'pgvector/pgvector:0.8.1-pg17',
  ], { timeout: 30_000 });
  const { stdout } = await exec('docker', ['port', container, '5432/tcp'], { timeout: 30_000 });
  const port = Number(/127\.0\.0\.1:(\d+)/.exec(stdout)?.[1]);
  const pool = new Pool({
    host: '127.0.0.1', port, user: 'meai', database: 'meai',
    password: 'test-only-password', connectionTimeoutMillis: 1000,
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (error) {
      if (attempt === 119) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  await migrate(pool);

  const documents = createPostgresDocumentRepository(pool);
  const processingDeps = {
    documents,
    versions: createPostgresVersionRepository(pool),
    chunks: createPostgresChunkRepository(pool),
    publication: createPostgresPublicationRepository(pool),
    reprocessing: createPostgresReprocessingRepository(pool),
    embeddings: wordEmbeddings,
    config: DEFAULT_RAG_CONFIG,
  };

  return {
    pool,
    documents,
    processingDeps,
    search: createPostgresSearchRepository(pool),
    async stop() {
      await pool.end();
      await exec('docker', ['stop', container], { timeout: 30_000 });
    },
  };
}

export function pdfUpload(name, bytes) {
  const formData = new FormData();
  formData.append('file', new Blob([Buffer.from(bytes)], { type: 'application/pdf' }), name);
  return new Request('http://localhost/api/documents', { method: 'POST', body: formData });
}

export function chatRequest(question, history = []) {
  return new Request('http://localhost/api/chat/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
  });
}

// Generator stand-in: answers in two progressive pieces and cites the best retrieved source.
export const citingGenerator = {
  async *stream(_question, sources) {
    yield { type: 'text', text: 'Según tus documentos, ' };
    yield { type: 'text', text: sources[0].text };
    yield { type: 'final', citations: [sources[0].id] };
  },
};
