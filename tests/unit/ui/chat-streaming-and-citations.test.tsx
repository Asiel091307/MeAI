// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ChatPanel } from '../../../components/chat-panel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('displays progressive text events before the final event and shows an in-progress indicator while generating (T51, T53)', async () => {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const mockFetch = vi.fn<typeof fetch>(async () => {
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });

  render(<ChatPanel fetchFn={mockFetch} />);

  const input = screen.getByLabelText(/escribe tu pregunta|pregunta/i);
  fireEvent.change(input, { target: { value: '¿Cuándo se entregan las solicitudes?' } });
  fireEvent.click(screen.getByRole('button', { name: /enviar pregunta/i }));

  // 1. Emit generating status and first partial text chunk while stream remains open
  controller.enqueue(
    encoder.encode(
      'data: {"type":"status","phase":"generating","message":"Generando respuesta fundamentada..."}\n\n',
    ),
  );
  controller.enqueue(
    encoder.encode('data: {"type":"text","text":"Las solicitudes se entregan "}\n\n'),
  );

  // Verify progressive text and in-progress indicator are visible BEFORE final event arrives
  expect(await screen.findByText(/Las solicitudes se entregan/)).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('Generando respuesta fundamentada...');

  //While generating, sending a second question is blocked (button is disabled)
  expect(
    (screen.getByRole('button', { name: /respondiendo|enviar pregunta/i }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);

  // 2. Emit remaining text and final event with citations (T53)
  controller.enqueue(
    encoder.encode('data: {"type":"text","text":"en septiembre."}\n\n'),
  );
  controller.enqueue(
    encoder.encode(
      JSON.stringify({
        type: 'final',
        text: 'Las solicitudes se entregan en septiembre.',
        citations: [
          {
            chunkId: 'chunk-conv-3',
            documentId: 'doc-conv',
            documentName: 'convocatoria.pdf',
            page: 3,
            text: 'Las solicitudes se entregan en septiembre en ventanilla única.',
            available: true,
          },
        ],
      }).replace(/^/, 'data: ') + '\n\n',
    ),
  );
  controller.close();

  // Verify final answer and its citation with document name, page, and fragment are shown (T53)
  expect(await screen.findByText('Las solicitudes se entregan en septiembre.')).toBeTruthy();
  expect(screen.getByText(/convocatoria\.pdf/i)).toBeTruthy();
  expect(screen.getByText(/Página 3/i)).toBeTruthy();
  expect(screen.getByText(/chunk-conv-3/i)).toBeTruthy();

  // In-progress indicator disappears once finished
  await waitFor(() => {
    expect(screen.queryByRole('status')).toBeNull();
  });
});

test('removes partial text when generation fails or is interrupted and shows error with retry option (T52)', async () => {
  let callCount = 0;

  const mockFetch = vi.fn<typeof fetch>(async () => {
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

  render(<ChatPanel fetchFn={mockFetch} />);

  const input = screen.getByLabelText(/escribe tu pregunta|pregunta/i);
  fireEvent.change(input, { target: { value: '¿Cuál es el horario de atención?' } });
  fireEvent.click(screen.getByRole('button', { name: /enviar pregunta/i }));

  // Error alert and retry button are displayed
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('No se pudo generar la respuesta en este momento.');

  // Partial text was discarded and is NOT shown as a valid answer
  expect(screen.queryByText(/Texto parcial incompleto que debe retirarse/)).toBeNull();

  // Clicking retry re-sends the question and displays the complete answer
  const retryButton = screen.getByRole('button', { name: /reintentar/i });
  fireEvent.click(retryButton);

  expect(await screen.findByText('Respuesta completa tras reintentar.')).toBeTruthy();
  expect(mockFetch).toHaveBeenCalledTimes(2);
});
