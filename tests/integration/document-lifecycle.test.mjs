import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { test } from 'vitest';
import { createPostgresChunkRepository } from '../../src/db/postgres-chunks';
import { createPostgresDocumentRepository } from '../../src/db/postgres-documents';
import { createPostgresPublicationRepository } from '../../src/db/postgres-publication';
import { createPostgresReprocessingRepository } from '../../src/db/postgres-reprocessing';
import { createPostgresSearchRepository } from '../../src/db/postgres-search';
import { createPostgresVersionRepository } from '../../src/db/postgres-versions';
import { deleteDocument } from '../../src/documents/delete-document';
import { processDocument } from '../../src/documents/process-document';
import { registerDocument } from '../../src/documents/register-document';
import { reprocessDocument } from '../../src/documents/reprocess-document';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { searchQuestion } from '../../src/rag/retrieval/search-question';
import { toAnswerSource } from '../../src/rag/retrieval/to-answer-source';
import { createTextPdf } from '../helpers/pdf-fixtures';

const exec = promisify(execFile);
const DIMENSIONS = 1536;

// Deterministic stand-in for Gemini with real meaning: each word adds weight to one of 1536
// positions (a "bag of words"), so texts that share words point in similar directions and
// pgvector's cosine search finds the right page without calling any external API.
function wordVector(text) {
  const vector = new Array(DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().normalize('NFD').replace(/[^a-z\s]/g, '').split(/\s+/)) {
    if (word.length < 4) continue;
    let hash = 0;
    for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) % DIMENSIONS;
    vector[hash] += 1;
  }
  vector[DIMENSIONS - 1] += 0.01;
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
}

const embeddings = {
  async embed(text) { return wordVector(text); },
  async embedDocuments(texts) { return texts.map(wordVector); },
};

async function startDatabase() {
  const container = `meai_life_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
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
  for (const file of [
    '001_create_documents.sql', '002_create_document_versions.sql',
    '003_create_chunks.sql', '004_add_chunk_embeddings.sql',
    '005_flexible_embeddings.sql',
  ]) {
    await pool.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
  }
  return { container, pool };
}

test('upload, process, search, reprocess and delete a document end to end', async () => {
  const { container, pool } = await startDatabase();
  try {
    const documents = createPostgresDocumentRepository(pool);
    const deps = {
      documents,
      versions: createPostgresVersionRepository(pool),
      chunks: createPostgresChunkRepository(pool),
      publication: createPostgresPublicationRepository(pool),
      reprocessing: createPostgresReprocessingRepository(pool),
      embeddings,
      embeddingModel: 'test-model',
      config: DEFAULT_RAG_CONFIG,
    };
    const search = { documents, embeddings, search: createPostgresSearchRepository(pool, { embeddingModel: 'test-model' }), topK: 2 };

    // 1. Upload and process: the document becomes available.
    const registered = await registerDocument(documents, {
      name: 'tramite.pdf',
      bytes: createTextPdf([
        'La solicitud de beca se presenta durante septiembre en la secretaria.',
        'El pago de la matricula vence durante octubre en ventanilla.',
      ]),
    });
    const documentId = registered.document.id;
    assert.deepEqual(await processDocument(documentId, deps), { status: 'available' });

    // 2. Search: the page that talks about the question comes first, with what is needed to cite it.
    const found = await searchQuestion('¿Cuándo se presenta la solicitud de beca?', search);
    assert.equal(found.ok, true);
    assert.equal(found.chunks[0].documentId, documentId);
    assert.equal(found.chunks[0].page, 1);
    assert.match(found.chunks[0].text, /septiembre/);
    assert.ok(found.chunks[0].score > found.chunks[1].score);
    assert.deepEqual(toAnswerSource(found.chunks[0]), {
      id: found.chunks[0].chunkId, documentId, page: 1, text: found.chunks[0].text,
      score: found.chunks[0].score,
    });

    // 3. Reprocess with other chunk sizes: only the new version answers afterwards.
    const firstVersion = (await documents.findById(documentId))?.activeVersionId;
    const reprocessed = await reprocessDocument(documentId, {
      ...deps, config: { ...DEFAULT_RAG_CONFIG, chunkSize: 40, chunkOverlap: 10 },
    });
    assert.deepEqual(reprocessed, { status: 'available' });
    const secondVersion = (await documents.findById(documentId))?.activeVersionId;
    assert.notEqual(secondVersion, firstVersion);
    const afterReprocess = await searchQuestion('matricula octubre', search);
    assert.equal(afterReprocess.ok, true);
    assert.equal(afterReprocess.chunks[0].page, 2);
    const versions = await pool.query('SELECT DISTINCT version_id FROM chunks WHERE document_id = $1', [documentId]);
    assert.deepEqual(versions.rows.map(({ version_id: id }) => id), [secondVersion]);

    // 4. Delete: nothing can be found any more, and a second delete reports it is gone.
    assert.deepEqual(await deleteDocument(documentId, documents), { status: 'deleted' });
    const afterDelete = await searchQuestion('solicitud de beca', search);
    assert.equal(afterDelete.ok, false);
    assert.equal(afterDelete.retryable, false);
    assert.equal((await deleteDocument(documentId, documents)).status, 'not_found');
  } finally {
    await pool.end();
    await exec('docker', ['stop', container], { timeout: 30_000 });
  }
}, 180_000);
