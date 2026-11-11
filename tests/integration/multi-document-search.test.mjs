import assert from 'node:assert/strict';
import { test } from 'vitest';
import { processDocument } from '../../src/documents/process-document';
import { createTextPdf } from '../helpers/pdf-fixtures';
import { startMvpEnvironment, wordEmbeddings } from '../helpers/mvp-environment.mjs';

// RF-3.2: the search covers every available document, each hit keeping its own document and page.
test('a question whose words appear in two documents retrieves chunks from both with their own document and page', async () => {
  const env = await startMvpEnvironment();
  try {
    const becas = await env.documents.create({
      name: 'becas.pdf',
      pdfBytes: createTextPdf([
        'Introduccion general sin relacion.',
        'La solicitud de beca se presenta durante septiembre.',
      ]),
    });
    const horario = await env.documents.create({
      name: 'horario.pdf',
      pdfBytes: createTextPdf(['La solicitud de horario se presenta durante septiembre.']),
    });
    assert.deepEqual(await processDocument(becas.id, env.processingDeps), { status: 'available' });
    assert.deepEqual(await processDocument(horario.id, env.processingDeps), { status: 'available' });

    const vector = await wordEmbeddings.embed('¿Cuándo se presenta la solicitud durante septiembre?');
    const results = await env.search.searchSimilar(vector, 10);

    const hits = results.map(({ documentId, page }) => `${documentId}:${page}`);
    assert.ok(hits.includes(`${becas.id}:2`), 'chunk from page 2 of the first document');
    assert.ok(hits.includes(`${horario.id}:1`), 'chunk from page 1 of the second document');
    assert.equal(new Set(results.map(({ documentId }) => documentId)).size, 2);
  } finally {
    await env.stop();
  }
}, 240_000);
