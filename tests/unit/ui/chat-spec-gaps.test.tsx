// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AppShell } from '../../../components/app-shell';
import { NO_AVAILABLE_DOCUMENTS_REASON } from '../../../src/rag/answering/available-documents-guard';
import {
  DELETED_DOCUMENT_CANCELLATION_REASON,
  REPROCESSING_DOCUMENT_CANCELLATION_REASON,
} from '../../../src/rag/answering/dependent-query-cancellation';

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

beforeEach(() => setViewport(1280));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const AVAILABLE_DOCUMENTS = [
  {
    id: 'doc-x',
    name: 'manual.pdf',
    status: 'available',
    error: null,
    activeVersionId: 'ver-1',
    createdAt: '2026-11-10T10:00:00.000Z',
  },
];

// Routes the library (list and delete) to one available document and the chat to the given
// handler, so the shell never blocks a question for lack of documents.
function shellFetch(chatFetch: typeof fetch) {
  return vi.fn<typeof fetch>(async (input, init) => {
    if (String(input) === '/api/chat/answers') {
      return chatFetch(input, init);
    }
    if (init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return jsonResponse(200, { documents: AVAILABLE_DOCUMENTS, message: null });
  });
}

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
  score: 0.87,
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
    const chatFetch = vi.fn<typeof fetch>(async () => {
      call += 1;
      if (call === 1) {
        return sse(
          { type: 'text', text: 'Texto parcial que no debe quedar' },
          { type: 'error', error: reason, retryable: false, discardPartialText: true },
        );
      }
      return sse({ type: 'final', text: 'Respuesta nueva.', citations: [] });
    });

    render(<AppShell fetchFn={shellFetch(chatFetch)} />);
    ask('¿Qué dice el documento?');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(reason);
    expect(screen.queryByText(/Texto parcial que no debe quedar/)).toBeNull();

    const input = screen.getByLabelText('Escribe tu pregunta') as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
    ask('Otra pregunta');

    expect(await screen.findByText('Respuesta nueva.')).toBeTruthy();
    expect(chatFetch).toHaveBeenCalledTimes(2);
  },
);

test('keeps messages and marks the citation as unavailable when its document is deleted (RF-5.6, CL-5)', async () => {
  const chatFetch = vi.fn<typeof fetch>(async () =>
    sse({ type: 'final', text: 'Respuesta con fuente.', citations: [CITATION_X] }),
  );

  render(<AppShell fetchFn={shellFetch(chatFetch)} pollIntervalMs={0} />);
  ask('¿Qué dice el manual?');

  const history = () => within(screen.getByLabelText('Historial de conversación'));
  expect(await history().findByText('Respuesta con fuente.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Fuente 1: manual.pdf, página 2' })).toBeTruthy();
  expect(screen.getByText('manual.pdf · p. 2')).toBeTruthy();

  fireEvent.click(await screen.findByRole('button', { name: 'Más acciones de manual.pdf' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar manual.pdf' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar: eliminar manual.pdf' }));

  expect(
    await screen.findByRole('button', {
      name: 'Fuente 1 no disponible (documento eliminado): manual.pdf, página 2',
    }),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Fuente 1: manual.pdf, página 2' })).toBeNull();
  expect(screen.getByText('Fuente no disponible (documento eliminado)')).toBeTruthy();
  expect(history().getByText('¿Qué dice el manual?')).toBeTruthy();
  expect(history().getByText('Respuesta con fuente.')).toBeTruthy();
});

test('disables input and submit button while answering and re-enables them after success (RF-5.4, CL-11)', async () => {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const chatFetch = vi.fn<typeof fetch>(async () => new Response(stream, { status: 200 }));

  render(<AppShell fetchFn={shellFetch(chatFetch)} />);
  ask('Pregunta en curso');

  await waitFor(() => {
    expect((screen.getByLabelText('Escribe tu pregunta') as HTMLTextAreaElement).disabled).toBe(true);
  });
  const submit = screen.getByRole('button', { name: 'Enviar pregunta' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  expect(submit.textContent).toBe('Respondiendo…');

  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ type: 'final', text: 'Listo.', citations: [] })}\n\n`),
  );
  controller.close();

  expect(await screen.findByText('Listo.')).toBeTruthy();
  await waitFor(() => {
    expect((screen.getByLabelText('Escribe tu pregunta') as HTMLTextAreaElement).disabled).toBe(false);
  });
  expect((screen.getByRole('button', { name: 'Enviar pregunta' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

test('re-enables input and submit button after the answer fails (RF-5.4, CL-11)', async () => {
  const chatFetch = vi.fn<typeof fetch>(async () =>
    sse({
      type: 'error',
      error: 'No se pudo generar la respuesta en este momento. Inténtalo de nuevo.',
      retryable: true,
      discardPartialText: true,
    }),
  );

  render(<AppShell fetchFn={shellFetch(chatFetch)} />);
  ask('Pregunta que falla');

  await screen.findByRole('alert');
  expect((screen.getByLabelText('Escribe tu pregunta') as HTMLTextAreaElement).disabled).toBe(false);
  expect((screen.getByRole('button', { name: 'Enviar pregunta' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

test.each([
  ['empty', ''],
  ['whitespace-only', '   \t  '],
])('rejects an %s question with a Spanish message and never calls fetch (RF-3.1, CL-6)', (_label, value) => {
  const chatFetch = vi.fn<typeof fetch>();

  render(<AppShell fetchFn={shellFetch(chatFetch)} />);
  ask(value);

  expect(screen.getByRole('alert').textContent).toContain(
    'Escribe una pregunta para consultar tus documentos.',
  );
  expect(chatFetch).not.toHaveBeenCalled();
});

test('shows the Spanish error when the server rejects a question longer than 1000 characters (RF-3.1, CL-6)', async () => {
  const reason =
    'La pregunta tiene 1001 caracteres y supera el límite de 1000 caracteres.';
  const chatFetch = vi.fn<typeof fetch>(async () => jsonResponse(400, { error: reason }));

  render(<AppShell fetchFn={shellFetch(chatFetch)} />);
  // The new question bar caps the textarea at 1000 characters, so the browser never sends 1001;
  // the server error path is still shown when the server rejects the question.
  expect((screen.getByLabelText('Escribe tu pregunta') as HTMLTextAreaElement).maxLength).toBe(1000);
  ask('a'.repeat(1000));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(reason);
  expect(chatFetch).toHaveBeenCalledTimes(1);
});

test('shows the no-available-documents reason from a 400 even with previous messages (RF-3.4, CL-8)', async () => {
  let call = 0;
  const chatFetch = vi.fn<typeof fetch>(async () => {
    call += 1;
    if (call === 1) {
      return sse({ type: 'final', text: 'Primera respuesta.', citations: [] });
    }
    return jsonResponse(400, { error: NO_AVAILABLE_DOCUMENTS_REASON });
  });

  render(<AppShell fetchFn={shellFetch(chatFetch)} />);
  ask('Primera pregunta');
  expect(await screen.findByText('Primera respuesta.')).toBeTruthy();

  ask('Segunda pregunta');

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(NO_AVAILABLE_DOCUMENTS_REASON);
  expect(screen.getByText('Primera respuesta.')).toBeTruthy();
});

test('shows each source separately when the final event cites two different documents (RF-4.4, CL-7)', async () => {
  const chatFetch = vi.fn<typeof fetch>(async () =>
    sse({
      type: 'final',
      text: 'Respuesta combinada.',
      citations: [
        { ...CITATION_X, chunkId: 'chunk-a', documentId: 'doc-a', documentName: 'alfa.pdf', page: 4 },
        { ...CITATION_X, chunkId: 'chunk-b', documentId: 'doc-b', documentName: 'beta.pdf', page: 7 },
      ],
    }),
  );

  render(<AppShell fetchFn={shellFetch(chatFetch)} />);
  ask('¿Qué dicen ambos?');

  expect(await screen.findByRole('button', { name: 'Fuente 1: alfa.pdf, página 4' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Fuente 2: beta.pdf, página 7' })).toBeTruthy();
  expect(screen.getByText('alfa.pdf · p. 4')).toBeTruthy();
  expect(screen.getByText('beta.pdf · p. 7')).toBeTruthy();
});
