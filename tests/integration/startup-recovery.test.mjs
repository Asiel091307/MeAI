import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { test, vi } from 'vitest';
import { recoverInterruptedDocumentsAtStartup } from '../../instrumentation-node';
import { INTERRUPTED_PROCESSING_REASON } from '../../src/documents/recover-interrupted-documents';
import { processDocument } from '../../src/documents/process-document';
import { createTextPdf } from '../helpers/pdf-fixtures';
import { startMvpEnvironment, wordEmbeddings } from '../helpers/mvp-environment.mjs';

// RF-2.3 / CL-9 / RNF-5: the startup recovery against a real database.
test('startup recovery fails an interrupted document, keeps an available one queryable, and tolerates an unreachable database', async () => {
  const env = await startMvpEnvironment();
  try {
    const available = await env.documents.create({
      name: 'disponible.pdf',
      pdfBytes: createTextPdf(['La beca cubre el ochenta por ciento de la colegiatura.']),
    });
    assert.deepEqual(await processDocument(available.id, env.processingDeps), { status: 'available' });
    // Created as 'processing' with no previous version, plus a half-written attempt.
    const interrupted = await env.documents.create({
      name: 'interrumpido.pdf',
      pdfBytes: createTextPdf(['Texto que nunca se publico.']),
    });
    const attempt = await env.processingDeps.versions.create(interrupted.id);
    await env.processingDeps.chunks.save(interrupted.id, attempt.id, [
      { page: 1, position: 1, text: 'Texto que nunca se publico.', embedding: await wordEmbeddings.embed('x') },
    ]);

    await recoverInterruptedDocumentsAtStartup(env.pool);

    const recovered = await env.documents.findById(interrupted.id);
    assert.equal(recovered.status, 'failed');
    assert.equal(recovered.error, INTERRUPTED_PROCESSING_REASON);
    assert.equal(recovered.activeVersionId, null);
    const leftovers = await env.pool.query(
      'SELECT count(*)::int AS n FROM chunks WHERE document_id = $1',
      [interrupted.id],
    );
    assert.equal(leftovers.rows[0].n, 0);

    // The available document is untouched and still answers searches.
    const still = await env.documents.findById(available.id);
    assert.equal(still.status, 'available');
    const hits = await env.search.searchSimilar(await wordEmbeddings.embed('beca colegiatura ochenta'), 5);
    assert.deepEqual([...new Set(hits.map(({ documentId }) => documentId))], [available.id]);

    // With the database unreachable the server must still start: the failure is only logged.
    const unreachable = new Pool({
      host: '127.0.0.1', port: 1, user: 'meai', database: 'meai',
      password: 'test-only-password', connectionTimeoutMillis: 500,
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await recoverInterruptedDocumentsAtStartup(unreachable);
      assert.equal(logged.mock.calls.length, 1);
      assert.match(String(logged.mock.calls[0][0]), /Startup recovery of interrupted documents failed/);
    } finally {
      logged.mockRestore();
      await unreachable.end();
    }
  } finally {
    await env.stop();
  }
}, 240_000);
