import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createDeleteDocumentHandler } from '../../app/api/documents/[id]/delete-document-handler';
import { createReprocessDocumentHandler } from '../../app/api/documents/[id]/reprocess/reprocess-document-handler';
import { createGetDocumentsHandler } from '../../app/api/documents/list-documents-handler';
import { createPostDocumentHandler } from '../../app/api/documents/post-document-handler';
import { processDocument } from '../../src/documents/process-document';
import { createDependentQueryCoordinator } from '../../src/rag/answering/dependent-query-cancellation';
import { createDamagedPdf, createProtectedPdf } from '../helpers/pdf-fixtures';
import { pdfUpload, startMvpEnvironment } from '../helpers/mvp-environment.mjs';

const routeContext = (id) => ({ params: Promise.resolve({ id }) });

// RF-1.6 / RF-2.3 / CL-1: damaged and protected PDFs are kept as 'failed' with a Spanish cause,
// can be retried and can be deleted, all through the real route handlers and PostgreSQL.
test('damaged and protected PDFs end failed with their cause, can be reprocessed and deleted', async () => {
  const env = await startMvpEnvironment();
  try {
    const started = [];
    const upload = createPostDocumentHandler(env.documents, (documentId) => started.push(documentId));
    let processing = Promise.resolve();
    const reprocess = createReprocessDocumentHandler(
      env.processingDeps.reprocessing,
      (documentId) => { processing = processDocument(documentId, env.processingDeps); },
      createDependentQueryCoordinator(),
    );
    const remove = createDeleteDocumentHandler(env.documents, createDependentQueryCoordinator());
    const listDocuments = createGetDocumentsHandler(env.documents);

    const cases = [
      { name: 'danado.pdf', bytes: createDamagedPdf(), cause: /El PDF está dañado/ },
      { name: 'protegido.pdf', bytes: createProtectedPdf(), cause: /El PDF está protegido/ },
    ];
    const ids = [];
    for (const { name, bytes, cause } of cases) {
      const response = await upload(pdfUpload(name, bytes));
      assert.equal(response.status, 201);
      const { document } = await response.json();
      assert.equal(document.status, 'failed');
      assert.match(document.error, cause);
      ids.push(document.id);
    }
    // Nothing to process: registered straight as failed.
    assert.deepEqual(started, []);

    const listed = (await (await listDocuments()).json()).documents;
    assert.deepEqual(listed.map(({ name, status }) => [name, status]), [
      ['danado.pdf', 'failed'],
      ['protegido.pdf', 'failed'],
    ]);
    cases.forEach(({ cause }, index) => assert.match(listed[index].error, cause));

    // Retry: accepted (202), and the new attempt fails again with a cause (RF-9.5).
    for (const [index, id] of ids.entries()) {
      const accepted = await reprocess(new Request('http://localhost', { method: 'POST' }), routeContext(id));
      assert.equal(accepted.status, 202);
      assert.equal((await accepted.json()).document.status, 'processing');
      assert.equal((await processing).status, 'failed');
      const after = await env.documents.findById(id);
      assert.equal(after.status, 'failed');
      assert.equal(after.activeVersionId, null);
      assert.match(after.error, cases[index].cause);
    }
    const versions = await env.pool.query('SELECT count(*)::int AS n FROM document_versions');
    assert.equal(versions.rows[0].n, 0, 'failed attempts leave no versions');

    // Delete: 204 and nothing is left.
    for (const id of ids) {
      const deleted = await remove(new Request('http://localhost', { method: 'DELETE' }), routeContext(id));
      assert.equal(deleted.status, 204);
    }
    assert.deepEqual((await (await listDocuments()).json()).documents, []);
    const leftovers = await env.pool.query(
      `SELECT (SELECT count(*) FROM documents)::int AS documents,
              (SELECT count(*) FROM document_versions)::int AS versions,
              (SELECT count(*) FROM chunks)::int AS chunks`,
    );
    assert.deepEqual(leftovers.rows[0], { documents: 0, versions: 0, chunks: 0 });
  } finally {
    await env.stop();
  }
}, 240_000);
