import { expect, test, vi } from 'vitest';
import type { AnswerSource } from '../../src/rag/providers/generation';
import { NO_EVIDENCE_MESSAGE } from '../../src/rag/providers/grounded-prompt';
import { createOpenAiCompatibleAnswerGenerator } from '../../src/rag/providers/openai-compatible-generation';

const sources: AnswerSource[] = [
  { id: 'chunk-1', documentId: 'doc-1', page: 1, text: 'El plazo vence el viernes.', score: 0.9 },
  { id: 'chunk-2', documentId: 'doc-2', page: 3, text: 'Se entrega en ventanilla.', score: 0.8 },
];

const sse = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const sseResponse = (body: BodyInit) =>
  new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

async function collect(iterable: AsyncIterable<unknown>) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

test('sends a streaming chat completions request with the grounded prompt', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () =>
    sseResponse(sse('Vence el viernes. ') + sse('[FUENTES: chunk-1]') + 'data: [DONE]\n\n'),
  );
  const generator = createOpenAiCompatibleAnswerGenerator({
    baseUrl: 'https://api.example.com/v1/',
    apiKey: 'secret-key',
    model: 'chat-1',
    fetch: fetchFn,
  });

  const events = await collect(generator.stream('¿Cuándo vence?', sources));

  const [url, init] = fetchFn.mock.calls[0];
  expect(String(url)).toBe('https://api.example.com/v1/chat/completions');
  expect(init?.method).toBe('POST');
  expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer secret-key' });
  const body = JSON.parse(String(init?.body));
  expect(body.model).toBe('chat-1');
  expect(body.stream).toBe(true);
  expect(body.messages[0].role).toBe('system');
  expect(body.messages[0].content).toContain('evidencia');
  expect(body.messages[1].role).toBe('user');
  expect(body.messages[1].content).toContain('¿Cuándo vence?');
  expect(body.messages[1].content).toContain('chunk-2');
  expect(events).toEqual([
    { type: 'text', text: 'Vence el viernes. ' },
    { type: 'final', citations: ['chunk-1'] },
  ]);
});

test('omits Authorization when there is no key', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => sseResponse(sse('Hola.') + 'data: [DONE]\n\n'));
  const generator = createOpenAiCompatibleAnswerGenerator({
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    model: 'llama',
    fetch: fetchFn,
  });
  await collect(generator.stream('?', sources));
  expect(fetchFn.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json' });
});

test('streams progressively and hides split citation markers, dropping invented ids', async () => {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const generator = createOpenAiCompatibleAnswerGenerator({
    baseUrl: 'http://x/v1',
    apiKey: '',
    model: 'm',
    fetch: vi.fn<typeof fetch>(async () => sseResponse(stream)),
  });
  const iterator = generator.stream('?', sources)[Symbol.asyncIterator]();

  controller.enqueue(encoder.encode(sse('El plazo vence el viernes. ')));
  expect(await iterator.next()).toEqual({ done: false, value: { type: 'text', text: 'El plazo vence el viernes. ' } });

  controller.enqueue(encoder.encode(sse('Se entrega en ventanilla.[FU')));
  expect(await iterator.next()).toEqual({ done: false, value: { type: 'text', text: 'Se entrega en ventanilla.' } });

  controller.enqueue(encoder.encode(': keep-alive\n\ndata: {bad json\n\n'));
  controller.enqueue(encoder.encode(sse('ENTES: chunk-1, ')));
  controller.enqueue(encoder.encode(sse('chunk-2, chunk-falso]')));
  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
  controller.close();

  expect(await iterator.next()).toEqual({
    done: false,
    value: { type: 'final', citations: ['chunk-1', 'chunk-2'] },
  });
  expect((await iterator.next()).done).toBe(true);
});

test('handles an SSE line split across network chunks', async () => {
  const encoder = new TextEncoder();
  const line = sse('Hola mundo.');
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(encoder.encode(line.slice(0, 20)));
      c.enqueue(encoder.encode(line.slice(20)));
      c.close();
    },
  });
  const generator = createOpenAiCompatibleAnswerGenerator({
    baseUrl: 'http://x/v1',
    apiKey: '',
    model: 'm',
    fetch: vi.fn<typeof fetch>(async () => sseResponse(stream)),
  });
  expect(await collect(generator.stream('?', sources))).toEqual([
    { type: 'text', text: 'Hola mundo.' },
    { type: 'final', citations: [] },
  ]);
});

test('reports no evidence with empty citations', async () => {
  const generator = createOpenAiCompatibleAnswerGenerator({
    baseUrl: 'http://x/v1',
    apiKey: '',
    model: 'm',
    fetch: vi.fn<typeof fetch>(async () => sseResponse(sse(NO_EVIDENCE_MESSAGE) + sse('[FUENTES: chunk-1]'))),
  });
  expect(await collect(generator.stream('?', sources))).toEqual([
    { type: 'text', text: NO_EVIDENCE_MESSAGE },
    { type: 'final', citations: [] },
  ]);
});

test('no sources answers immediately without calling the API', async () => {
  const fetchFn = vi.fn<typeof fetch>();
  const generator = createOpenAiCompatibleAnswerGenerator({
    baseUrl: 'http://x/v1',
    apiKey: 'secret-key',
    model: 'm',
    fetch: fetchFn,
  });
  expect(await collect(generator.stream('?', []))).toEqual([
    { type: 'text', text: NO_EVIDENCE_MESSAGE },
    { type: 'final', citations: [] },
  ]);
  expect(fetchFn).not.toHaveBeenCalled();
});

test('HTTP errors and missing bodies throw without the key', async () => {
  const failing = createOpenAiCompatibleAnswerGenerator({
    baseUrl: 'http://x/v1',
    apiKey: 'secret-key',
    model: 'm',
    fetch: vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ error: { message: 'invalid secret-key' } }), { status: 401 }),
    ),
  });
  const error = (await collect(failing.stream('?', sources)).catch((e: Error) => e)) as Error;
  expect(error.message).toContain('401');
  expect(error.message).not.toContain('secret-key');

  const noBody = createOpenAiCompatibleAnswerGenerator({
    baseUrl: 'http://x/v1',
    apiKey: 'secret-key',
    model: 'm',
    fetch: vi.fn<typeof fetch>(async () => new Response(null, { status: 200 })),
  });
  const error2 = await collect(noBody.stream('?', sources)).catch((e: Error) => e);
  expect(error2).toBeInstanceOf(Error);
  expect((error2 as Error).message).not.toContain('secret-key');
});
