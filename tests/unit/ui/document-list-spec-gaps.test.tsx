// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import type { PublicDocumentItem } from '../../../app/api/documents/public-document';
import { DocumentList } from '../../../components/document-list';

afterEach(() => {
  cleanup();
});

test('a failed document offers both the reprocess and the delete actions (RF-2.4)', () => {
  const documents: PublicDocumentItem[] = [
    {
      id: 'doc-failed',
      name: 'roto.pdf',
      status: 'failed',
      error: 'No se pudo extraer texto del PDF.',
      activeVersionId: null,
      createdAt: '2026-11-10T10:10:00.000Z',
    },
  ];

  render(<DocumentList documents={documents} />);

  expect(screen.getByRole('button', { name: 'Reprocesar roto.pdf' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Eliminar roto.pdf' })).toBeTruthy();
});

test('an available document with an error from a failed reprocess shows the error and stays available (RF-9.4)', () => {
  const documents: PublicDocumentItem[] = [
    {
      id: 'doc-restored',
      name: 'vigente.pdf',
      status: 'available',
      error: 'El reprocesamiento falló; se conserva la versión anterior.',
      activeVersionId: 'ver-1',
      createdAt: '2026-11-10T10:00:00.000Z',
    },
  ];

  render(<DocumentList documents={documents} />);

  expect(screen.getByText('Disponible')).toBeTruthy();
  expect(screen.getByText('El reprocesamiento falló; se conserva la versión anterior.')).toBeTruthy();
});
