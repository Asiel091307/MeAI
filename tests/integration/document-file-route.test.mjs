import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createGetDocumentFileHandler } from '../../app/api/documents/[id]/file/file-handler';
import { createPostDocumentHandler } from '../../app/api/documents/post-document-handler';
import { createTextPdf } from '../helpers/pdf-fixtures';
import { pdfUpload, startMvpEnvironment } from '../helpers/mvp-environment.mjs';

const routeContext = (id) => ({ params: Promise.resolve({ id }) });
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// T004-04: the real repository serves back exactly the stored PDF.
test('GET /api/documents/:id/file serves the stored PDF byte for byte', async () => {
  const env = await startMvpEnvironment();
  try {
    const upload = createPostDocumentHandler(env.documents, () => {});
    const pdf = createTextPdf(['Contenido de la guía de becas.']);
    const uploaded = await upload(pdfUpload('Guía "becas".pdf', pdf));
    const documentId = (await uploaded.json()).document.id;

    const getFile = async (id) => {
      if (!UUID_PATTERN.test(id)) return { status: 'not_found' };
      const document = await env.documents.findById(id);
      return document
        ? { status: 'found', name: document.name, bytes: document.pdfBytes }
        : { status: 'not_found' };
    };
    const handler = createGetDocumentFileHandler(getFile);
    const request = new Request('http://localhost');

    const found = await handler(request, routeContext(documentId));
    assert.equal(found.status, 200);
    assert.equal(found.headers.get('Content-Type'), 'application/pdf');
    assert.match(found.headers.get('Content-Disposition'), /^inline; filename="Gu_a _becas_\.pdf"; filename\*=UTF-8''Gu%C3%ADa%20%22becas%22\.pdf$/);
    assert.deepEqual(Buffer.from(await found.arrayBuffer()), Buffer.from(pdf));

    const unknown = await handler(request, routeContext('99999999-9999-9999-9999-999999999999'));
    assert.equal(unknown.status, 404);
    const malformed = await handler(request, routeContext('not-a-uuid'));
    assert.equal(malformed.status, 404);
  } finally {
    await env.stop();
  }
}, 240_000);
