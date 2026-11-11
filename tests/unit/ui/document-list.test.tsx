// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { EMPTY_DOCUMENTS_MESSAGE, type PublicDocumentItem } from '../../../app/api/documents/list-documents-handler';
import { DocumentList } from '../../../components/document-list';
import { DocumentsPanel } from '../../../components/documents-panel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('shows the empty state inviting the user to upload their first PDF when the list is empty', () => {
  render(<DocumentList documents={[]} />);

  expect(screen.getByText(EMPTY_DOCUMENTS_MESSAGE)).toBeTruthy();
});

test('shows the received documents with their Spanish status labels', () => {
  const documents: PublicDocumentItem[] = [
    {
      id: 'doc-1',
      name: 'manual-rag.pdf',
      status: 'available',
      error: null,
      activeVersionId: 'ver-1',
      createdAt: '2026-11-10T10:00:00.000Z',
    },
    {
      id: 'doc-2',
      name: 'escaneo.pdf',
      status: 'processing',
      error: null,
      activeVersionId: null,
      createdAt: '2026-11-10T10:05:00.000Z',
    },
    {
      id: 'doc-3',
      name: 'protegido.pdf',
      status: 'failed',
      error: 'El archivo PDF está protegido con contraseña.',
      activeVersionId: null,
      createdAt: '2026-11-10T10:10:00.000Z',
    },
  ];

  render(<DocumentList documents={documents} />);

  expect(screen.getByText('manual-rag.pdf')).toBeTruthy();
  expect(screen.getByText('Disponible')).toBeTruthy();

  expect(screen.getByText('escaneo.pdf')).toBeTruthy();
  expect(screen.getByText('En procesamiento')).toBeTruthy();

  expect(screen.getByText('protegido.pdf')).toBeTruthy();
  expect(screen.getByText('Fallido')).toBeTruthy();
  expect(screen.getByText('El archivo PDF está protegido con contraseña.')).toBeTruthy();
});

test('DocumentsPanel loads and displays the empty state from GET /api/documents', async () => {
  const mockFetch = vi.fn<typeof fetch>(async () => {
    return new Response(
      JSON.stringify({
        documents: [],
        message: EMPTY_DOCUMENTS_MESSAGE,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });

  render(<DocumentsPanel fetchFn={mockFetch} />);

  expect(await screen.findByText(EMPTY_DOCUMENTS_MESSAGE)).toBeTruthy();
  expect(mockFetch).toHaveBeenCalledWith('/api/documents', expect.objectContaining({ cache: 'no-store' }));
});
