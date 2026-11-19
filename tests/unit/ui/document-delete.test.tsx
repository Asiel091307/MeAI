// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { PublicDocumentItem } from '../../../app/api/documents/list-documents-handler';
import { AppShell } from '../../../components/app-shell';

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

const CONFIRMATION_TEXT =
  '¿Eliminar este documento? Se borran el PDF, sus fragmentos y sus embeddings. No se puede deshacer.';

function listResponse(): Response {
  return new Response(JSON.stringify({ documents: initialDocs, message: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Opens the card menu of contrato.pdf and starts the delete flow (shows the inline confirmation).
async function startDelete() {
  fireEvent.click(await screen.findByRole('button', { name: 'Más acciones de contrato.pdf' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar contrato.pdf' }));
}

test('asks for confirmation before deleting and cancels without calling DELETE', async () => {
  const mockFetch = vi.fn<typeof fetch>(async () => listResponse());

  render(<AppShell fetchFn={mockFetch} initialDocuments={initialDocs} pollIntervalMs={0} />);

  await startDelete();

  // Shows the inline confirmation
  expect(screen.getByText(CONFIRMATION_TEXT)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Confirmar: eliminar contrato.pdf' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

  // Confirmation is dismissed and DELETE was never called
  expect(screen.queryByText(CONFIRMATION_TEXT)).toBeNull();
  expect(screen.getByRole('article', { name: 'contrato.pdf' })).toBeTruthy();
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
    return listResponse();
  });

  render(<AppShell fetchFn={mockFetch} initialDocuments={initialDocs} pollIntervalMs={0} />);

  await startDelete();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar: eliminar contrato.pdf' }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('No se pudo eliminar el documento');
  expect(screen.getByRole('article', { name: 'contrato.pdf' })).toBeTruthy();
});

test('removes the document from the list only after confirmed DELETE succeeds with 204', async () => {
  const mockFetch = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return listResponse();
  });

  render(<AppShell fetchFn={mockFetch} initialDocuments={initialDocs} pollIntervalMs={0} />);

  await startDelete();

  // Nothing is deleted until the user confirms
  expect(mockFetch.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
  expect(screen.getByRole('article', { name: 'contrato.pdf' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Confirmar: eliminar contrato.pdf' }));

  await waitFor(() => {
    expect(screen.queryByRole('article', { name: 'contrato.pdf' })).toBeNull();
  });
  expect(mockFetch).toHaveBeenCalledWith(
    '/api/documents/11111111-2222-3333-4444-555555555555',
    expect.objectContaining({ method: 'DELETE' }),
  );
});
