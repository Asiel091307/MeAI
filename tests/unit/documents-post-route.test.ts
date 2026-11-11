import { afterEach, expect, test } from 'vitest';
import {
  createPostDocumentHandler,
  setDocumentPostRepositoryForTesting,
} from '../../app/api/documents/post-document-handler';
import { POST } from '../../app/api/documents/route';
import type { Document, DocumentRepository } from '../../src/db/contracts';
import {
  createBlankPdf,
  createDamagedPdf,
  createProtectedPdf,
} from '../helpers/pdf-fixtures';

function createMockDocumentRepository() {
  const created: Document[] = [];
  const repo: Pick<DocumentRepository, 'create'> = {
    async create(input) {
      const doc: Document = {
        id: `doc-${created.length + 1}`,
        name: input.name,
        pdfBytes: input.pdfBytes,
        status: input.status ?? 'processing',
        error: input.error ?? null,
        activeVersionId: null,
        createdAt: new Date('2026-11-09T10:00:00.000Z'),
      };
      created.push(doc);
      return doc;
    },
  };
  return { repo, created };
}

function makePdfFormData(name: string, bytes: Uint8Array): FormData {
  const formData = new FormData();
  const blob = new Blob([Buffer.from(bytes)], { type: 'application/pdf' });
  formData.append('file', blob, name);
  return formData;
}

afterEach(() => {
  setDocumentPostRepositoryForTesting(null);
});

test('POST /api/documents with a valid PDF registers the document and returns 201 with status processing', async () => {
  const { repo, created } = createMockDocumentRepository();
  setDocumentPostRepositoryForTesting(repo);

  const pdf = createBlankPdf(1);
  const formData = makePdfFormData('notas.pdf', pdf);
  const request = new Request('http://localhost:3000/api/documents', {
    method: 'POST',
    body: formData,
  });

  const response = await POST(request);
  const body = await response.json();

  expect(response.status).toBe(201);
  expect(body).toEqual({
    document: {
      id: 'doc-1',
      name: 'notas.pdf',
      status: 'processing',
      error: null,
      activeVersionId: null,
      createdAt: '2026-11-09T10:00:00.000Z',
    },
  });
  expect(body.document).not.toHaveProperty('pdfBytes');
  expect(body.document).not.toHaveProperty('pdf_bytes');
  expect(created).toHaveLength(1);
});

test('POST /api/documents with a non-PDF file returns 400 with a reason in Spanish', async () => {
  const { repo, created } = createMockDocumentRepository();
  const handler = createPostDocumentHandler(repo);

  const textBytes = new TextEncoder().encode('hola mundo');
  const formData = new FormData();
  formData.append('file', new Blob([Buffer.from(textBytes)], { type: 'text/plain' }), 'archivo.txt');

  const request = new Request('http://localhost:3000/api/documents', {
    method: 'POST',
    body: formData,
  });

  const response = await handler(request);
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body).toEqual({
    error: 'El archivo no es un PDF. Solo se admiten documentos PDF.',
  });
  expect(created).toHaveLength(0);
});

test('POST /api/documents with a PDF exceeding 10 MB returns 400 with a reason in Spanish', async () => {
  const { repo, created } = createMockDocumentRepository();
  const handler = createPostDocumentHandler(repo);

  const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
  oversized.set([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  const formData = makePdfFormData('pesado.pdf', oversized);

  const request = new Request('http://localhost:3000/api/documents', {
    method: 'POST',
    body: formData,
  });

  const response = await handler(request);
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body).toEqual({
    error: 'El archivo supera el límite de 10 MB.',
  });
  expect(created).toHaveLength(0);
});

test('POST /api/documents with a PDF exceeding 100 pages returns 400 with a reason in Spanish', async () => {
  const { repo, created } = createMockDocumentRepository();
  const handler = createPostDocumentHandler(repo);

  const longPdf = createBlankPdf(101);
  const formData = makePdfFormData('largo.pdf', longPdf);

  const request = new Request('http://localhost:3000/api/documents', {
    method: 'POST',
    body: formData,
  });

  const response = await handler(request);
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body).toEqual({
    error: 'El PDF tiene 101 páginas y supera el límite de 100 páginas.',
  });
  expect(created).toHaveLength(0);
});

test('POST /api/documents with a damaged PDF returns 201 and registers as failed with readable cause', async () => {
  const { repo, created } = createMockDocumentRepository();
  const handler = createPostDocumentHandler(repo);

  const damaged = createDamagedPdf();
  const formData = makePdfFormData('danado.pdf', damaged);

  const request = new Request('http://localhost:3000/api/documents', {
    method: 'POST',
    body: formData,
  });

  const response = await handler(request);
  const body = await response.json();

  expect(response.status).toBe(201);
  expect(body).toEqual({
    document: {
      id: 'doc-1',
      name: 'danado.pdf',
      status: 'failed',
      error: 'El PDF está dañado y no se pudieron contar sus páginas.',
      activeVersionId: null,
      createdAt: '2026-11-09T10:00:00.000Z',
    },
  });
  expect(created).toHaveLength(1);
});

test('POST /api/documents with a password protected PDF returns 201 and registers as failed with readable cause', async () => {
  const { repo, created } = createMockDocumentRepository();
  const handler = createPostDocumentHandler(repo);

  const protectedPdf = createProtectedPdf();
  const formData = makePdfFormData('protegido.pdf', protectedPdf);

  const request = new Request('http://localhost:3000/api/documents', {
    method: 'POST',
    body: formData,
  });

  const response = await handler(request);
  const body = await response.json();

  expect(response.status).toBe(201);
  expect(body).toEqual({
    document: {
      id: 'doc-1',
      name: 'protegido.pdf',
      status: 'failed',
      error: 'El PDF está protegido y no se pudieron contar sus páginas.',
      activeVersionId: null,
      createdAt: '2026-11-09T10:00:00.000Z',
    },
  });
  expect(created).toHaveLength(1);
});

test('POST /api/documents without a file returns 400 with a message in Spanish', async () => {
  const { repo } = createMockDocumentRepository();
  const handler = createPostDocumentHandler(repo);

  const emptyFormData = new FormData();
  const request = new Request('http://localhost:3000/api/documents', {
    method: 'POST',
    body: emptyFormData,
  });

  const response = await handler(request);
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body).toEqual({
    error: 'No se ha proporcionado ningún archivo para registrar.',
  });
});

