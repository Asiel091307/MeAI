import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  createPostChatAnswersHandler,
  parseChatAnswerSseEvents,
} from '../../app/api/chat/answers/chat-answers-handler';
import { createDeleteDocumentHandler } from '../../app/api/documents/[id]/delete-document-handler';
import { createReprocessDocumentHandler } from '../../app/api/documents/[id]/reprocess/reprocess-document-handler';
import { createGetDocumentsHandler } from '../../app/api/documents/list-documents-handler';
import { createPostDocumentHandler } from '../../app/api/documents/post-document-handler';
import { processDocument } from '../../src/documents/process-document';
import { createActiveQuestionGuard } from '../../src/rag/answering/active-question-guard';
import { createDependentQueryCoordinator } from '../../src/rag/answering/dependent-query-cancellation';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { createTextPdf } from '../helpers/pdf-fixtures';
import {
  chatRequest,
  citingGenerator,
  pdfUpload,
  startMvpEnvironment,
  wordEmbeddings,
} from '../helpers/mvp-environment.mjs';

const routeContext = (id) => ({ params: Promise.resolve({ id }) });

async function queryableVersions(pool, documentId) {
  const result = await pool.query(
    `SELECT DISTINCT c.version_id FROM chunks c JOIN documents d
       ON d.id = c.document_id AND d.active_version_id = c.version_id AND d.status = 'available'
     WHERE c.document_id = $1`,
    [documentId],
  );
  return result.rows.map(({ version_id: id }) => id);
}

// T65a: delete and reprocess persisted documents through the real route handlers.
test('a reprocessed document answers only from its new version, and a deleted one never comes back', async () => {
  const env = await startMvpEnvironment();
  try {
    const coordinator = createDependentQueryCoordinator();
    let processing = Promise.resolve();
    const upload = createPostDocumentHandler(env.documents, (documentId) => {
      processing = processDocument(documentId, env.processingDeps);
    });
    // Reprocessing uses other chunk sizes, so the new version is clearly different. It waits
    // for `release()` so the test can look at the document while the attempt is in progress.
    let release = () => {};
    const reprocess = createReprocessDocumentHandler(env.processingDeps.reprocessing, (documentId) => {
      const gate = new Promise((resolve) => { release = resolve; });
      processing = gate.then(() => processDocument(documentId, {
        ...env.processingDeps,
        config: { ...DEFAULT_RAG_CONFIG, chunkSize: 40, chunkOverlap: 10 },
      }));
    }, coordinator);
    const remove = createDeleteDocumentHandler(env.documents, coordinator);
    const listDocuments = createGetDocumentsHandler(env.documents);
    const ask = () => createPostChatAnswersHandler({
      documents: env.documents,
      embeddings: wordEmbeddings,
      search: env.search,
      generator: citingGenerator,
      topK: 5,
      guard: createActiveQuestionGuard(),
      coordinator,
    })(chatRequest('¿Cuándo se presenta la solicitud de beca?'));

    const uploaded = await upload(pdfUpload('becas.pdf', createTextPdf([
      'La solicitud de beca se presenta durante septiembre en la secretaria.',
    ])));
    const documentId = (await uploaded.json()).document.id;
    await processing;
    const firstVersion = (await env.documents.findById(documentId))?.activeVersionId;
    assert.deepEqual(await queryableVersions(env.pool, documentId), [firstVersion]);

    // RF-9: reprocess → 202 'processing', excluded from queries while it runs, then only the new version.
    const accepted = await reprocess(new Request('http://localhost'), routeContext(documentId));
    assert.equal(accepted.status, 202);
    assert.equal((await accepted.json()).document.status, 'processing');
    assert.deepEqual(await queryableVersions(env.pool, documentId), []);
    const busy = await reprocess(new Request('http://localhost'), routeContext(documentId));
    assert.equal(busy.status, 409);
    release();
    await processing;

    const afterReprocess = await env.documents.findById(documentId);
    assert.equal(afterReprocess?.status, 'available');
    assert.notEqual(afterReprocess?.activeVersionId, firstVersion);
    assert.deepEqual(await queryableVersions(env.pool, documentId), [afterReprocess?.activeVersionId]);
    const answer = parseChatAnswerSseEvents(await (await ask()).text()).find(({ type }) => type === 'final');
    assert.equal(answer.citations[0].documentId, documentId);

    // RF-8: delete → 204; it is gone from the list, from search and from the database.
    const deleted = await remove(new Request('http://localhost', { method: 'DELETE' }), routeContext(documentId));
    assert.equal(deleted.status, 204);
    assert.deepEqual((await (await listDocuments()).json()).documents, []);
    const leftovers = await env.pool.query(
      `SELECT (SELECT count(*) FROM documents)::int AS documents,
              (SELECT count(*) FROM document_versions)::int AS versions,
              (SELECT count(*) FROM chunks)::int AS chunks`,
    );
    assert.deepEqual(leftovers.rows[0], { documents: 0, versions: 0, chunks: 0 });
    const noDocuments = await ask();
    assert.equal(noDocuments.status, 400);
    assert.match((await noDocuments.json()).error, /Primero debe procesarse un documento/);

    // It does not come back: a second delete or a reprocess answer 404.
    assert.equal((await remove(new Request('http://localhost'), routeContext(documentId))).status, 404);
    assert.equal((await reprocess(new Request('http://localhost'), routeContext(documentId))).status, 404);
  } finally {
    await env.stop();
  }
}, 240_000);
