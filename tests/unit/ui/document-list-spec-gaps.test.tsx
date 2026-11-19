// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { PublicDocumentItem } from '../../../app/api/documents/public-document';
import { AppShell } from '../../../components/app-shell';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderLibrary(documents: PublicDocumentItem[]) {
  const mockFetch = vi.fn<typeof fetch>(async () => {
    return new Response(JSON.stringify({ documents, message: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  render(<AppShell fetchFn={mockFetch} initialDocuments={documents} pollIntervalMs={0} />);
}

test('a failed document offers both the reprocess and the delete actions (RF-2.4)', () => {
  renderLibrary([
    {
      id: 'doc-failed',
      name: 'roto.pdf',
      status: 'failed',
      error: 'No se pudo extraer texto del PDF.',
      activeVersionId: null,
      createdAt: '2026-11-10T10:10:00.000Z',
    },
  ]);

  // The failed card shows its error and a direct retry; reprocess and delete live in the menu
  expect(screen.getByRole('button', { name: 'Reintentar roto.pdf' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Más acciones de roto.pdf' }));
  expect(screen.getByRole('menuitem', { name: 'Reprocesar roto.pdf' })).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'Eliminar roto.pdf' })).toBeTruthy();
});

test('an available document with an error from a failed reprocess shows the error and stays available (RF-9.4)', () => {
  renderLibrary([
    {
      id: 'doc-restored',
      name: 'vigente.pdf',
      status: 'available',
      error: 'El reprocesamiento falló; se conserva la versión anterior.',
      activeVersionId: 'ver-1',
      createdAt: '2026-11-10T10:00:00.000Z',
    },
  ]);

  expect(screen.getByLabelText('Estado de vigente.pdf').textContent).toBe('Disponible');
  expect(screen.getByRole('note').textContent).toBe(
    'El reprocesamiento falló; se conserva la versión anterior.',
  );
  // It is not failed, so there is no direct retry button
  expect(screen.queryByRole('button', { name: 'Reintentar vigente.pdf' })).toBeNull();
});
