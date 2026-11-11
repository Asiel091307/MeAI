// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ChatPanel } from '../../../components/chat-panel';
import { NO_AVAILABLE_DOCUMENTS_REASON } from '../../../src/rag/answering/available-documents-guard';
import {
  DELETED_DOCUMENT_CANCELLATION_REASON,
  REPROCESSING_DOCUMENT_CANCELLATION_REASON,
} from '../../../src/rag/answering/dependent-query-cancellation';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function sse(...events: unknown[]): Response {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ask(question: string) {
  fireEvent.change(screen.getByLabelText('Escribe tu pregunta'), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));
}

const CITATION_X = {
  chunkId: 'chunk-x-1',
  documentId: 'doc-x',
  documentName: 'manual.pdf',
  page: 2,
  text: 'Texto del manual.',
  available: true,
};

test.each([
  ['deleted document', DELETED_DOCUMENT_CANCELLATION_REASON],
  ['reprocessing document', REPROCESSING_DOCUMENT_CANCELLATION_REASON],
])(
  'discards partial text on %s cancellation, shows the reason and allows asking again (RF-8.3, RF-9.6)',
  async (_label, reason) => {
    let call = 0;
    const mockFetch = vi.fn<typeof fetch>(async () => {
      call += 1;
      if (call === 1) {
        return sse(
          { type: 'text', text: 'Texto parcial que no debe quedar' },
          { type: 'error', error: reason, retryable: false, discardPartialText: true },
        );
      }
      return sse({ type: 'final', text: 'Respuesta nueva.', citations: [] });
    });

    render(<ChatPanel fetchFn={mockFetch} />);
    ask('¿Qué dice el documento?');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(reason);
    expect(screen.queryByText(/Texto parcial que no debe quedar/)).toBeNull();

    const input = screen.getByLabelText('Escribe tu pregunta') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    ask('Otra pregunta');

    expect(await screen.findByText('Respuesta nueva.')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  },
);

test('keeps messages and marks the citation as unavailable when its document is deleted (RF-5.6, CL-5)', async () => {
  const mockFetch = vi.fn<typeof fetch>(async () =>
    sse({ type: 'final', text: 'Respuesta con fuente.', citations: [CITATION_X] }),
  );

  const { rerender } = render(<ChatPanel fetchFn={mockFetch} deletedDocumentIds={[]} />);
  ask('¿Qué dice el manual?');

  expect(await screen.findByText('Respuesta con fuente.')).toBeTruthy();
  expect(screen.getByText(/Fuente: manual\.pdf — Página 2/)).toBeTruthy();

  rerender(<ChatPanel fetchFn={mockFetch} deletedDocumentIds={['doc-x']} />);

  await waitFor(() => {
    expect(
      screen.getByText('Fuente no disponible (documento eliminado): manual.pdf — Página 2'),
    ).toBeTruthy();
  });
  expect(screen.queryByText(/Fuente: manual\.pdf/)).toBeNull();
  expect(screen.getByText('¿Qué dice el manual?')).toBeTruthy();
  expect(screen.getByText('Respuesta con fuente.')).toBeTruthy();
});

test('disables input and submit button while answering and re-enables them after success (RF-5.4, CL-11)', async () => {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const mockFetch = vi.fn<typeof fetch>(async () => new Response(stream, { status: 200 }));

  render(<ChatPanel fetchFn={mockFetch} />);
  ask('Pregunta en curso');

  await waitFor(() => {
    expect((screen.getByLabelText('Escribe tu pregunta') as HTMLInputElement).disabled).toBe(true);
  });
  expect((screen.getByRole('button', { name: 'Respondiendo...' }) as HTMLButtonElement).disabled).toBe(
    true,
  );

  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ type: 'final', text: 'Listo.', citations: [] })}\n\n`),
  );
  controller.close();

  expect(await screen.findByText('Listo.')).toBeTruthy();
  await waitFor(() => {
    expect((screen.getByLabelText('Escribe tu pregunta') as HTMLInputElement).disabled).toBe(false);
  });
  expect((screen.getByRole('button', { name: 'Enviar pregunta' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

test('re-enables input and submit button after the answer fails (RF-5.4, CL-11)', async () => {
  const mockFetch = vi.fn<typeof fetch>(async () =>
    sse({
      type: 'error',
      error: 'No se pudo generar la respuesta en este momento. Inténtalo de nuevo.',
      retryable: true,
      discardPartialText: true,
    }),
  );

  render(<ChatPanel fetchFn={mockFetch} />);
  ask('Pregunta que falla');

  await screen.findByRole('alert');
  expect((screen.getByLabelText('Escribe tu pregunta') as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByRole('button', { name: 'Enviar pregunta' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

test.each([
  ['empty', ''],
  ['whitespace-only', '   \t  '],
])('rejects an %s question with a Spanish message and never calls fetch (RF-3.1, CL-6)', (_label, value) => {
  const mockFetch = vi.fn<typeof fetch>();

  render(<ChatPanel fetchFn={mockFetch} />);
  ask(value);

  expect(screen.getByRole('alert').textContent).toContain('La pregunta no puede estar vacía.');
  expect(mockFetch).not.toHaveBeenCalled();
});

test('shows the Spanish error when the server rejects a question longer than 1000 characters (RF-3.1, CL-6)', async () => {
  const reason =
    'La pregunta tiene 1001 caracteres y supera el límite de 1000 caracteres.';
  const mockFetch = vi.fn<typeof fetch>(async () => jsonResponse(400, { error: reason }));

  render(<ChatPanel fetchFn={mockFetch} />);
  ask('a'.repeat(1001));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(reason);
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test('shows the no-available-documents reason from a 400 even with previous messages (RF-3.4, CL-8)', async () => {
  let call = 0;
  const mockFetch = vi.fn<typeof fetch>(async () => {
    call += 1;
    if (call === 1) {
      return sse({ type: 'final', text: 'Primera respuesta.', citations: [] });
    }
    return jsonResponse(400, { error: NO_AVAILABLE_DOCUMENTS_REASON });
  });

  render(<ChatPanel fetchFn={mockFetch} />);
  ask('Primera pregunta');
  expect(await screen.findByText('Primera respuesta.')).toBeTruthy();

  ask('Segunda pregunta');

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(NO_AVAILABLE_DOCUMENTS_REASON);
  expect(screen.getByText('Primera respuesta.')).toBeTruthy();
});

test('shows each source separately when the final event cites two different documents (RF-4.4, CL-7)', async () => {
  const mockFetch = vi.fn<typeof fetch>(async () =>
    sse({
      type: 'final',
      text: 'Respuesta combinada.',
      citations: [
        { ...CITATION_X, chunkId: 'chunk-a', documentId: 'doc-a', documentName: 'alfa.pdf', page: 4 },
        { ...CITATION_X, chunkId: 'chunk-b', documentId: 'doc-b', documentName: 'beta.pdf', page: 7 },
      ],
    }),
  );

  render(<ChatPanel fetchFn={mockFetch} />);
  ask('¿Qué dicen ambos?');

  expect(await screen.findByText('Fuente: alfa.pdf — Página 4 (Fragmento chunk-a)')).toBeTruthy();
  expect(screen.getByText('Fuente: beta.pdf — Página 7 (Fragmento chunk-b)')).toBeTruthy();
});
