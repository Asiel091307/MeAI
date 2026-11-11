// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import HomePage from '../../../app/page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('a confirmed delete in the documents panel marks the chat citation as unavailable (RF-5.6, CL-5)', async () => {
  const documents = [
    {
      id: 'doc-x',
      name: 'manual.pdf',
      status: 'available',
      error: null,
      activeVersionId: 'ver-1',
      createdAt: '2026-11-10T10:00:00.000Z',
    },
  ];

  const fakeFetch = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url === '/api/chat/answers') {
      return new Response(
        `data: ${JSON.stringify({
          type: 'final',
          text: 'Respuesta con fuente.',
          citations: [
            {
              chunkId: 'chunk-x-1',
              documentId: 'doc-x',
              documentName: 'manual.pdf',
              page: 2,
              text: 'Texto.',
              available: true,
            },
          ],
        })}\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    }
    if (init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ documents, message: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fakeFetch);

  render(<HomePage />);

  fireEvent.change(screen.getByLabelText('Escribe tu pregunta'), {
    target: { value: '¿Qué dice el manual?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));
  expect(await screen.findByText(/Fuente: manual\.pdf — Página 2/)).toBeTruthy();

  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar manual.pdf' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));

  expect(
    await screen.findByText('Fuente no disponible (documento eliminado): manual.pdf — Página 2'),
  ).toBeTruthy();
  expect(screen.getByText('Respuesta con fuente.')).toBeTruthy();
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: 'Eliminar manual.pdf' })).toBeNull();
  });
});
