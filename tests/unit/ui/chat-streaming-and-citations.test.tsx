// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AppShell } from '../../../components/app-shell';

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const AVAILABLE_DOCUMENTS = [
  {
    id: 'doc-conv',
    name: 'convocatoria.pdf',
    status: 'available',
    error: null,
    activeVersionId: 'ver-1',
    createdAt: '2026-11-10T10:00:00.000Z',
  },
];

// Routes the library listing to one available document and the chat to the given handler.
function shellFetch(chatFetch: typeof fetch) {
  return vi.fn<typeof fetch>(async (input, init) => {
    if (String(input) === '/api/chat/answers') {
      return chatFetch(input, init);
    }
    return new Response(JSON.stringify({ documents: AVAILABLE_DOCUMENTS, message: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

test('displays progressive text events before the final event and shows an in-progress indicator while generating (T51, T53)', async () => {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const chatFetch = vi.fn<typeof fetch>(async () => {
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });

  render(<AppShell fetchFn={shellFetch(chatFetch)} />);

  const input = screen.getByLabelText('Escribe tu pregunta');
  fireEvent.change(input, { target: { value: '¿Cuándo se entregan las solicitudes?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));

  // 1. Emit the generating status while the stream remains open: the in-progress indicator shows it
  controller.enqueue(
    encoder.encode(
      'data: {"type":"status","phase":"generating","message":"Generando respuesta fundamentada..."}\n\n',
    ),
  );
  await waitFor(() => {
    expect(screen.getByRole('status').textContent).toContain('Generando respuesta fundamentada...');
  });

  // 2. First partial text chunk: it shows in the provisional region (which replaces the status line)
  controller.enqueue(
    encoder.encode('data: {"type":"text","text":"Las solicitudes se entregan "}\n\n'),
  );

  // Verify progressive text is visible BEFORE the final event arrives
  const provisional = await screen.findByLabelText('Respuesta provisional en curso');
  expect(provisional.textContent).toContain('Las solicitudes se entregan');

  // While generating, sending a second question is blocked (button is disabled)
  expect(
    (screen.getByRole('button', { name: 'Enviar pregunta' }) as HTMLButtonElement).disabled,
  ).toBe(true);

  // 3. Emit remaining text and final event with citations (T53)
  controller.enqueue(encoder.encode('data: {"type":"text","text":"en septiembre."}\n\n'));
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({
        type: 'final',
        text: 'Las solicitudes se entregan en septiembre.',
        citations: [
          {
            chunkId: 'chunk-conv-3',
            documentId: 'doc-conv',
            documentName: 'convocatoria.pdf',
            page: 3,
            score: 0.91,
            text: 'Las solicitudes se entregan en septiembre en ventanilla única.',
            available: true,
          },
        ],
      })}\n\n`,
    ),
  );
  controller.close();

  // Verify the final answer is shown (T53)
  expect(await screen.findByText('Las solicitudes se entregan en septiembre.')).toBeTruthy();

  // The source is a chip with document and page; its evidence card shows document, page,
  // similarity and the fragment text
  expect(screen.getByRole('button', { name: 'Fuente 1: convocatoria.pdf, página 3' })).toBeTruthy();
  expect(screen.getByText('convocatoria.pdf · p. 3')).toBeTruthy();
  expect(screen.getByText('91%')).toBeTruthy();
  expect(
    screen.getByText('Las solicitudes se entregan en septiembre en ventanilla única.'),
  ).toBeTruthy();

  // In-progress indicator and provisional text disappear once finished
  await waitFor(() => {
    expect(screen.queryByRole('status')).toBeNull();
  });
  expect(screen.queryByLabelText('Respuesta provisional en curso')).toBeNull();
});

test('removes partial text when generation fails or is interrupted and shows error with retry option (T52)', async () => {
  let callCount = 0;

  const chatFetch = vi.fn<typeof fetch>(async () => {
    callCount += 1;
    if (callCount === 1) {
      const sseFailure = [
        'data: {"type":"status","phase":"generating","message":"Generando respuesta fundamentada..."}\n\n',
        'data: {"type":"text","text":"Texto parcial incompleto que debe retirarse..."}\n\n',
        'data: {"type":"error","error":"No se pudo generar la respuesta en este momento. Inténtalo de nuevo.","retryable":true,"discardPartialText":true}\n\n',
      ].join('');
      return new Response(sseFailure, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    const sseSuccess = [
      'data: {"type":"text","text":"Respuesta completa tras reintentar."}\n\n',
      'data: {"type":"final","text":"Respuesta completa tras reintentar.","citations":[]}\n\n',
    ].join('');
    return new Response(sseSuccess, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });

  render(<AppShell fetchFn={shellFetch(chatFetch)} />);

  const input = screen.getByLabelText('Escribe tu pregunta');
  fireEvent.change(input, { target: { value: '¿Cuál es el horario de atención?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));

  // Error alert and retry button are displayed
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('No se pudo generar la respuesta en este momento.');

  // Partial text was discarded and is NOT shown as a valid answer
  expect(screen.queryByText(/Texto parcial incompleto que debe retirarse/)).toBeNull();

  // Clicking retry re-sends the question and displays the complete answer
  const retryButton = screen.getByRole('button', { name: 'Reintentar pregunta' });
  fireEvent.click(retryButton);

  expect(await screen.findByText('Respuesta completa tras reintentar.')).toBeTruthy();
  expect(chatFetch).toHaveBeenCalledTimes(2);
});
