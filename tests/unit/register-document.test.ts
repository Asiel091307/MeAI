import { expect, test } from 'vitest';
import type { Document, NewDocument } from '../../src/db/contracts';
import { registerDocument } from '../../src/documents/register-document';
import { MAX_PDF_BYTES } from '../../src/rag/ingestion/pdf-upload-validation';
import {
  createBlankPdf,
  createDamagedPdf,
  createProtectedPdf,
} from '../helpers/pdf-fixtures';

function fakeRepository() {
  const created: NewDocument[] = [];
  return {
    created,
    async create(input: NewDocument): Promise<Document> {
      created.push(input);
      return {
        id: `document-${created.length}`,
        name: input.name,
        pdfBytes: input.pdfBytes,
        status: input.status ?? 'processing',
        error: input.error ?? null,
        activeVersionId: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      };
    },
  };
}

const pdfBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

test('a valid PDF is registered as processing', async () => {
  const documents = fakeRepository();
  const onePage = createBlankPdf(1);
  const result = await registerDocument(documents, { name: 'notas.pdf', bytes: onePage });

  expect(result).toMatchObject({
    registered: true,
    document: { id: 'document-1', name: 'notas.pdf', status: 'processing' },
  });
  expect(documents.created).toEqual([{ name: 'notas.pdf', pdfBytes: onePage }]);
});

test('a PDF of exactly 100 pages is registered', async () => {
  const documents = fakeRepository();
  const result = await registerDocument(documents, {
    name: 'cien.pdf',
    bytes: createBlankPdf(100),
  });

  expect(result).toMatchObject({ registered: true, document: { name: 'cien.pdf' } });
  expect(documents.created).toHaveLength(1);
});

test('a PDF of 101 pages is rejected without creating a document', async () => {
  const documents = fakeRepository();
  const result = await registerDocument(documents, {
    name: 'largo.pdf',
    bytes: createBlankPdf(101),
  });

  expect(result).toEqual({
    registered: false,
    reason: 'El PDF tiene 101 páginas y supera el límite de 100 páginas.',
  });
  expect(documents.created).toEqual([]);
});

test('a file that is not a PDF is rejected without creating a document', async () => {
  const documents = fakeRepository();
  const result = await registerDocument(documents, {
    name: 'texto.txt',
    bytes: new TextEncoder().encode('hola'),
  });

  expect(result).toEqual({
    registered: false,
    reason: 'El archivo no es un PDF. Solo se admiten documentos PDF.',
  });
  expect(documents.created).toEqual([]);
});

test('a PDF larger than 10 MB is rejected without creating a document', async () => {
  const documents = fakeRepository();
  const bytes = new Uint8Array(MAX_PDF_BYTES + 1);
  bytes.set(pdfBytes);
  const result = await registerDocument(documents, { name: 'grande.pdf', bytes });

  expect(result).toEqual({ registered: false, reason: 'El archivo supera el límite de 10 MB.' });
  expect(documents.created).toEqual([]);
});

test('a damaged PDF is registered as failed with a readable cause and no active version', async () => {
  const documents = fakeRepository();
  const bytes = createDamagedPdf();
  const result = await registerDocument(documents, { name: 'danado.pdf', bytes });

  expect(result).toMatchObject({
    registered: true,
    document: {
      name: 'danado.pdf',
      status: 'failed',
      error: 'El PDF está dañado y no se pudieron contar sus páginas.',
      activeVersionId: null,
      pdfBytes: bytes,
    },
  });
  expect(documents.created).toHaveLength(1);
  expect(documents.created[0]).toEqual({
    name: 'danado.pdf',
    pdfBytes: bytes,
    status: 'failed',
    error: 'El PDF está dañado y no se pudieron contar sus páginas.',
  });
});

test('a password protected PDF is registered as failed with a readable cause and no active version', async () => {
  const documents = fakeRepository();
  const bytes = createProtectedPdf();
  const result = await registerDocument(documents, { name: 'protegido.pdf', bytes });

  expect(result).toMatchObject({
    registered: true,
    document: {
      name: 'protegido.pdf',
      status: 'failed',
      error: 'El PDF está protegido y no se pudieron contar sus páginas.',
      activeVersionId: null,
      pdfBytes: bytes,
    },
  });
  expect(documents.created).toHaveLength(1);
  expect(documents.created[0]).toEqual({
    name: 'protegido.pdf',
    pdfBytes: bytes,
    status: 'failed',
    error: 'El PDF está protegido y no se pudieron contar sus páginas.',
  });
});
