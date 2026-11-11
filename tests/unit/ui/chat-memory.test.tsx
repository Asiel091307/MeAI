// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ChatPanel } from '../../../components/chat-panel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('keeps conversation messages in tab memory across turns and discards them upon page reload (T47)', async () => {
  const capturedBodies: Array<{ question: string; history: unknown[] }> = [];

  const mockFetch = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    capturedBodies.push(body);

    const turnNumber = capturedBodies.length;
    const answerText =
      turnNumber === 1
        ? 'La beca cubre el 80% de la colegiatura.'
        : 'Para renovarla se requiere mantener promedio de 9.0.';

    const ssePayload = [
      'data: {"type":"status","phase":"searching","message":"Buscando evidencia..."}\n\n',
      `data: {"type":"text","text":"${answerText}"}\n\n`,
      `data: {"type":"final","text":"${answerText}","citations":[{"chunkId":"c-${turnNumber}","documentId":"doc-1","documentName":"becas.pdf","page":${turnNumber},"text":"${answerText}","available":true}]}\n\n`,
    ].join('');

    return new Response(ssePayload, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });

  const { unmount } = render(<ChatPanel fetchFn={mockFetch} />);

  // First turn
  const input = screen.getByLabelText(/escribe tu pregunta|pregunta/i);
  fireEvent.change(input, { target: { value: '¿Qué porcentaje cubre la beca?' } });
  fireEvent.click(screen.getByRole('button', { name: /enviar pregunta/i }));

  expect(await screen.findByText('La beca cubre el 80% de la colegiatura.')).toBeTruthy();

  // Second turn (follow-up in the same tab session)
  fireEvent.change(input, { target: { value: '¿Y cómo se renueva?' } });
  fireEvent.click(screen.getByRole('button', { name: /enviar pregunta/i }));

  expect(
    await screen.findByText('Para renovarla se requiere mantener promedio de 9.0.'),
  ).toBeTruthy();

  // Both turns are visible in the same tab
  expect(screen.getByText('¿Qué porcentaje cubre la beca?')).toBeTruthy();
  expect(screen.getByText('La beca cubre el 80% de la colegiatura.')).toBeTruthy();
  expect(screen.getByText('¿Y cómo se renueva?')).toBeTruthy();

  // Second request included the history from the first turn
  expect(capturedBodies).toHaveLength(2);
  expect(capturedBodies[1].history).toHaveLength(2);

  // Nothing persisted in localStorage or sessionStorage
  expect(window.localStorage.length).toBe(0);
  expect(window.sessionStorage.length).toBe(0);

  // Simulate reloading the tab (unmount and mount a fresh instance)
  unmount();
  render(<ChatPanel fetchFn={mockFetch} />);

  await waitFor(() => {
    expect(screen.queryByText('¿Qué porcentaje cubre la beca?')).toBeNull();
    expect(screen.queryByText('La beca cubre el 80% de la colegiatura.')).toBeNull();
  });
});
