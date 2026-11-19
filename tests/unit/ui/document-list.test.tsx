// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { PublicDocumentItem } from '../../../app/api/documents/list-documents-handler';
import { AppShell } from '../../../components/app-shell';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const EMPTY_LIBRARY_TEXT = /Aún no hay documentos\. Arrastra un archivo/;

function listFetch(documents: PublicDocumentItem[]) {
  return vi.fn<typeof fetch>(async () => {
    return new Response(JSON.stringify({ documents, message: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

test('shows the empty state inviting the user to upload their first PDF when the list is empty', () => {
  render(<AppShell fetchFn={listFetch([])} initialDocuments={[]} pollIntervalMs={0} />);

  expect(screen.getByText(EMPTY_LIBRARY_TEXT)).toBeTruthy();
  expect(screen.getByLabelText('Subir documentos')).toBeTruthy();
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

  render(<AppShell fetchFn={listFetch(documents)} initialDocuments={documents} pollIntervalMs={0} />);

  expect(screen.getByRole('article', { name: 'manual-rag.pdf' })).toBeTruthy();
  expect(screen.getByLabelText('Estado de manual-rag.pdf').textContent).toBe('Disponible');

  expect(screen.getByRole('article', { name: 'escaneo.pdf' })).toBeTruthy();
  expect(screen.getByLabelText('Estado de escaneo.pdf').textContent).toBe('En procesamiento');

  expect(screen.getByRole('article', { name: 'protegido.pdf' })).toBeTruthy();
  expect(screen.getByLabelText('Estado de protegido.pdf').textContent).toBe('Fallido');
  expect(screen.getByRole('note').textContent).toBe('El archivo PDF está protegido con contraseña.');
});

test('the app loads and displays the empty state from GET /api/documents', async () => {
  const mockFetch = listFetch([]);

  render(<AppShell fetchFn={mockFetch} pollIntervalMs={0} />);

  expect(await screen.findByText(EMPTY_LIBRARY_TEXT)).toBeTruthy();
  expect(mockFetch).toHaveBeenCalledWith('/api/documents', expect.objectContaining({ cache: 'no-store' }));
});
