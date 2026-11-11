import assert from 'node:assert/strict';
import { test } from 'vitest';
import { processDocument } from '../../src/documents/process-document';
import { createMixedPdf } from '../helpers/pdf-fixtures';
import { startMvpEnvironment } from '../helpers/mvp-environment.mjs';

// CL-3 / RNF-7: real Tesseract and PostgreSQL. A scanned page OCR cannot read rejects the whole
// document, names the page, and leaves nothing behind.
test('a mixed PDF with an unreadable scanned page ends failed naming the page and leaves no chunks or versions', async () => {
  const env = await startMvpEnvironment();
  try {
    const marker = 'zafiroultrasecreto';
    const document = await env.documents.create({
      name: 'mixto.pdf',
      pdfBytes: createMixedPdf([
        { kind: 'digital', text: `La beca cubre el ochenta por ciento ${marker}` },
        { kind: 'scanned', text: '' },
      ]),
    });

    const result = await processDocument(document.id, env.processingDeps);

    assert.deepEqual(result, { status: 'failed', reason: 'No se pudo leer texto en la página 2.' });
    const stored = await env.documents.findById(document.id);
    assert.equal(stored.status, 'failed');
    assert.equal(stored.error, 'No se pudo leer texto en la página 2.');
    assert.equal(stored.activeVersionId, null);
    assert.ok(!stored.error.includes(marker));
    const leftovers = await env.pool.query(
      `SELECT (SELECT count(*) FROM document_versions)::int AS versions,
              (SELECT count(*) FROM chunks)::int AS chunks`,
    );
    assert.deepEqual(leftovers.rows[0], { versions: 0, chunks: 0 });
  } finally {
    await env.stop();
  }
}, 240_000);
