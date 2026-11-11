// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { PublicDocumentItem } from '../../../app/api/documents/list-documents-handler';
import { DocumentsPanel } from '../../../components/documents-panel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const initialDocs: PublicDocumentItem[] = [
  {
    id: '11111111-2222-3333-4444-555555555555',
    name: 'contrato.pdf',
    status: 'available',
    error: null,
    activeVersionId: 'ver-1',
    createdAt: '2026-11-10T10:00:00.000Z',
  },
];

test('asks for confirmation before deleting and cancels without calling DELETE', async () => {
  const mockFetch = vi.fn<typeof fetch>(async () => {
    return new Response(
      JSON.stringify({ documents: initialDocs, message: null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });

  render(<DocumentsPanel fetchFn={mockFetch} initialDocuments={initialDocs} />);

  const deleteButton = await screen.findByRole('button', { name: /eliminar contrato\.pdf/i });
  fireEvent.click(deleteButton);

  // Shows confirmation dialog/controls
  expect(screen.getByText(/¿confirmas que deseas eliminar contrato\.pdf\?/i)).toBeTruthy();

  const cancelButton = screen.getByRole('button', { name: /cancelar/i });
  fireEvent.click(cancelButton);

  // Confirmation is dismissed and DELETE was never called
  expect(screen.queryByText(/¿confirmas que deseas eliminar contrato\.pdf\?/i)).toBeNull();
  expect(screen.getByText('contrato.pdf')).toBeTruthy();
  const deleteCalls = mockFetch.mock.calls.filter(([, init]) => init?.method === 'DELETE');
  expect(deleteCalls).toHaveLength(0);
});

test('keeps the document in the list and displays an error when deletion fails', async () => {
  const mockFetch = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === 'DELETE') {
      return new Response(
        JSON.stringify({
          error: 'No se pudo eliminar el documento. No se borró nada; inténtalo de nuevo.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ documents: initialDocs, message: null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });

  render(<DocumentsPanel fetchFn={mockFetch} initialDocuments={initialDocs} />);

  fireEvent.click(await screen.findByRole('button', { name: /eliminar contrato\.pdf/i }));
  fireEvent.click(screen.getByRole('button', { name: /confirmar eliminación/i }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('No se pudo eliminar el documento');
  expect(screen.getByText('contrato.pdf')).toBeTruthy();
});

test('removes the document from the list only after confirmed DELETE succeeds with 204', async () => {
  const onDocumentDeleted = vi.fn();
  const mockFetch = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return new Response(
      JSON.stringify({ documents: initialDocs, message: null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });

  render(
    <DocumentsPanel
      fetchFn={mockFetch}
      initialDocuments={initialDocs}
      onDocumentDeleted={onDocumentDeleted}
    />,
  );

  fireEvent.click(await screen.findByRole('button', { name: /eliminar contrato\.pdf/i }));
  fireEvent.click(screen.getByRole('button', { name: /confirmar eliminación/i }));

  await waitFor(() => {
    expect(screen.queryByText('contrato.pdf')).toBeNull();
  });
  expect(onDocumentDeleted).toHaveBeenCalledWith('11111111-2222-3333-4444-555555555555');
});
