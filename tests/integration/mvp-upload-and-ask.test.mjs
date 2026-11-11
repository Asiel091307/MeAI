import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  createPostChatAnswersHandler,
  parseChatAnswerSseEvents,
} from '../../app/api/chat/answers/chat-answers-handler';
import { createGetDocumentsHandler } from '../../app/api/documents/list-documents-handler';
import { createPostDocumentHandler } from '../../app/api/documents/post-document-handler';
import { processDocument } from '../../src/documents/process-document';
import { createActiveQuestionGuard } from '../../src/rag/answering/active-question-guard';
import { createDependentQueryCoordinator } from '../../src/rag/answering/dependent-query-cancellation';
import { createTextPdf } from '../helpers/pdf-fixtures';
import {
  chatRequest,
  citingGenerator,
  pdfUpload,
  startMvpEnvironment,
  wordEmbeddings,
} from '../helpers/mvp-environment.mjs';

// T65: upload and ask with sources, through the real route handlers, PostgreSQL and pgvector.
test('uploading two PDFs and asking returns a progressive answer citing the right document and page', async () => {
  const env = await startMvpEnvironment();
  try {
    const processing = [];
    const upload = createPostDocumentHandler(env.documents, (documentId) => {
      processing.push(processDocument(documentId, env.processingDeps));
    });
    const listDocuments = createGetDocumentsHandler(env.documents);

    // RF-7: before anything is uploaded the list is empty and invites to upload.
    const empty = await (await listDocuments()).json();
    assert.deepEqual(empty.documents, []);
    assert.match(empty.message, /Sube tu primer PDF/);

    // RF-1 / RF-2: both uploads register as 'processing' and then become 'available'.
    const beca = await upload(pdfUpload('becas.pdf', createTextPdf([
      'La solicitud de beca se presenta durante septiembre en la secretaria.',
      'La beca cubre el ochenta por ciento de la colegiatura.',
    ])));
    const horario = await upload(pdfUpload('horario.pdf', createTextPdf([
      'La biblioteca abre de lunes a viernes por la manana.',
    ])));
    assert.equal(beca.status, 201);
    assert.equal(horario.status, 201);
    const becaId = (await beca.json()).document.id;
    assert.equal(processing.length, 2);
    assert.deepEqual(await Promise.all(processing), [{ status: 'available' }, { status: 'available' }]);

    const listed = await (await listDocuments()).json();
    assert.deepEqual(listed.documents.map(({ name, status }) => [name, status]), [
      ['becas.pdf', 'available'],
      ['horario.pdf', 'available'],
    ]);
    assert.ok(listed.documents.every((document) => !('pdfBytes' in document)));

    // RF-3 / RF-4 / RF-6: the answer arrives in pieces and cites document and page.
    const ask = createPostChatAnswersHandler({
      documents: env.documents,
      embeddings: wordEmbeddings,
      search: env.search,
      generator: citingGenerator,
      topK: 5,
      guard: createActiveQuestionGuard(),
      coordinator: createDependentQueryCoordinator(),
    });
    const response = await ask(chatRequest('¿Cuándo se presenta la solicitud de beca?'));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const events = parseChatAnswerSseEvents(await response.text());

    const types = events.map(({ type }) => type);
    assert.ok(types.includes('status'));
    assert.ok(types.indexOf('text') < types.indexOf('final'), 'text must arrive before the final event');
    assert.ok(!types.includes('error'));
    const final = events.find(({ type }) => type === 'final');
    assert.equal(final.citations.length, 1);
    assert.deepEqual(
      { documentId: final.citations[0].documentId, page: final.citations[0].page },
      { documentId: becaId, page: 1 },
    );
    assert.match(final.citations[0].text, /septiembre/);
    assert.equal(final.citations[0].available, true);
  } finally {
    await env.stop();
  }
}, 240_000);
