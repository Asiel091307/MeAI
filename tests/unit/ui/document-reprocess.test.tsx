// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { PublicDocumentItem } from '../../../app/api/documents/list-documents-handler';
import { AppShell } from '../../../components/app-shell';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('shows reprocess action for available and failed documents and reflects processing state upon clicking', async () => {
  const initialDocs: PublicDocumentItem[] = [
    {
      id: '11111111-2222-3333-4444-555555555555',
      name: 'fallido.pdf',
      status: 'failed',
      error: 'Error temporal en OCR.',
      activeVersionId: null,
      createdAt: '2026-11-10T10:00:00.000Z',
    },
    {
      id: '22222222-3333-4444-5555-666666666666',
      name: 'disponible.pdf',
      status: 'available',
      error: null,
      activeVersionId: 'ver-1',
      createdAt: '2026-11-10T10:05:00.000Z',
    },
  ];

  const mockFetch = vi.fn<typeof fetch>(async (url, init) => {
    if (init?.method === 'POST' && String(url).endsWith('/reprocess')) {
      return new Response(
        JSON.stringify({
          document: {
            id: '11111111-2222-3333-4444-555555555555',
            status: 'processing',
          },
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ documents: initialDocs, message: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  render(<AppShell fetchFn={mockFetch} initialDocuments={initialDocs} pollIntervalMs={0} />);

  // Both failed and available documents show a Reprocesar action in their menu
  fireEvent.click(await screen.findByRole('button', { name: 'Más acciones de disponible.pdf' }));
  expect(screen.getByRole('menuitem', { name: 'Reprocesar disponible.pdf' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Más acciones de fallido.pdf' }));
  const reprocessFailed = screen.getByRole('menuitem', { name: 'Reprocesar fallido.pdf' });
  expect(reprocessFailed).toBeTruthy();

  fireEvent.click(reprocessFailed);

  await waitFor(() => {
    expect(screen.getByLabelText('Estado de fallido.pdf').textContent).toBe('En procesamiento');
  });

  expect(mockFetch).toHaveBeenCalledWith(
    '/api/documents/11111111-2222-3333-4444-555555555555/reprocess',
    expect.objectContaining({ method: 'POST' }),
  );
});
