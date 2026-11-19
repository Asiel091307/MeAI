// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { PublicDocumentItem } from '../../../app/api/documents/list-documents-handler';
import { AppShell } from '../../../components/app-shell';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('reflects transition from processing to available without reloading the page', async () => {
  let callCount = 0;

  const mockFetch = vi.fn<typeof fetch>(async () => {
    callCount += 1;
    const doc: PublicDocumentItem =
      callCount === 1
        ? {
            id: 'doc-1',
            name: 'guia-estudio.pdf',
            status: 'processing',
            error: null,
            activeVersionId: null,
            createdAt: '2026-11-10T12:00:00.000Z',
          }
        : {
            id: 'doc-1',
            name: 'guia-estudio.pdf',
            status: 'available',
            error: null,
            activeVersionId: 'ver-1',
            createdAt: '2026-11-10T12:00:00.000Z',
          };

    return new Response(JSON.stringify({ documents: [doc], message: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  render(<AppShell fetchFn={mockFetch} pollIntervalMs={30} />);

  // Initially renders in 'processing' state
  await waitFor(() => {
    expect(screen.getByLabelText('Estado de guia-estudio.pdf').textContent).toBe('En procesamiento');
  });

  // Transitions to 'available' automatically without page reload
  await waitFor(() => {
    expect(screen.getByLabelText('Estado de guia-estudio.pdf').textContent).toBe('Disponible');
  });
  expect(screen.queryByText('En procesamiento')).toBeNull();
});

test('reflects transition from processing to failed and displays the Spanish cause without reloading', async () => {
  let callCount = 0;

  const mockFetch = vi.fn<typeof fetch>(async () => {
    callCount += 1;
    const doc: PublicDocumentItem =
      callCount === 1
        ? {
            id: 'doc-2',
            name: 'escaneo-borroso.pdf',
            status: 'processing',
            error: null,
            activeVersionId: null,
            createdAt: '2026-11-10T12:05:00.000Z',
          }
        : {
            id: 'doc-2',
            name: 'escaneo-borroso.pdf',
            status: 'failed',
            error: 'La página 2 no contiene texto legible tras aplicar OCR.',
            activeVersionId: null,
            createdAt: '2026-11-10T12:05:00.000Z',
          };

    return new Response(JSON.stringify({ documents: [doc], message: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  render(<AppShell fetchFn={mockFetch} pollIntervalMs={30} />);

  await waitFor(() => {
    expect(screen.getByLabelText('Estado de escaneo-borroso.pdf').textContent).toBe('En procesamiento');
  });

  await waitFor(() => {
    expect(screen.getByLabelText('Estado de escaneo-borroso.pdf').textContent).toBe('Fallido');
  });

  expect(screen.getByRole('note').textContent).toBe(
    'La página 2 no contiene texto legible tras aplicar OCR.',
  );
});
