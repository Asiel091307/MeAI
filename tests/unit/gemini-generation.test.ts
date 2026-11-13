import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import type { AnswerSource } from '../../src/rag/providers/generation';
import {
  createGeminiAnswerGenerator,
  NO_EVIDENCE_MESSAGE,
} from '../../src/rag/providers/gemini-generation';

test('GeminiAnswerGenerator sends request containing only valid sources and the question', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const mockFetch = vi.fn<typeof fetch>(async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;

    const ssePayload = [
      'data: {"candidates":[{"content":{"parts":[{"text":"La solicitud se presenta en septiembre. "}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"[FUENTES: chunk-1]"}]}}]}\n\n',
    ].join('');

    return new Response(ssePayload, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });

  const generator = createGeminiAnswerGenerator({
    apiKey: 'test-api-key',
    model: 'gemini-3.5-flash-lite',
    fetch: mockFetch,
  });

  const sources: AnswerSource[] = [
    {
      id: 'chunk-1',
      documentId: 'doc-1',
      page: 1,
      text: 'La solicitud se presenta en septiembre.',
      score: 0.9,
    },
  ];

  const events = [];
  for await (const event of generator.stream('¿Cuándo se presenta la solicitud?', sources)) {
    events.push(event);
  }

  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(capturedUrl).toContain('models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse');
  expect(capturedInit?.headers).toMatchObject({
    'x-goog-api-key': 'test-api-key',
    'Content-Type': 'application/json',
  });

  const requestBody = JSON.parse(String(capturedInit?.body));
  const userText = requestBody.contents[0].parts[0].text;

  // The request contains the question and the sources
  expect(userText).toContain('¿Cuándo se presenta la solicitud?');
  expect(userText).toContain('chunk-1');
  expect(userText).toContain('La solicitud se presenta en septiembre.');

  // The system instruction enforces strict grounding in evidence only and Spanish response
  const systemInstruction = requestBody.system_instruction.parts[0].text;
  expect(systemInstruction).toContain('evidencia');
  expect(systemInstruction).toContain('español');
  expect(systemInstruction).toContain('información suficiente');

  // Events emitted
  expect(events).toEqual([
    { type: 'text', text: 'La solicitud se presenta en septiembre. ' },
    { type: 'final', citations: ['chunk-1'] },
  ]);
});

test('GeminiAnswerGenerator strips invented citations not present in sources', async () => {
  const mockFetch = vi.fn<typeof fetch>(async () => {
    const ssePayload = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Respuesta con fuentes. [FUENTES: chunk-1, chunk-inventado]"}]}}]}\n\n',
    ].join('');

    return new Response(ssePayload, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });

  const generator = createGeminiAnswerGenerator({
    apiKey: 'test-api-key',
    fetch: mockFetch,
  });

  const sources: AnswerSource[] = [
    { id: 'chunk-1', documentId: 'doc-1', page: 1, text: 'Texto de prueba.', score: 0.9 },
  ];

  const events = [];
  for await (const event of generator.stream('¿Pregunta?', sources)) {
    events.push(event);
  }

  const finalEvent = events.find((e) => e.type === 'final');
  expect(finalEvent).toEqual({
    type: 'final',
    citations: ['chunk-1'],
  });
});

test('GeminiAnswerGenerator emits text chunks progressively as SSE arrives and hides split [FUENTES: ...] markers', async () => {
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

  const generator = createGeminiAnswerGenerator({
    apiKey: 'test-api-key',
    fetch: mockFetch,
  });

  const sources: AnswerSource[] = [
    { id: 'chunk-1', documentId: 'doc-1', page: 1, text: 'El plazo vence el viernes.', score: 0.9 },
    { id: 'chunk-2', documentId: 'doc-2', page: 3, text: 'Se entrega en ventanilla.', score: 0.9 },
  ];

  const iterator = generator.stream('¿Cuándo vence y dónde se entrega?', sources)[Symbol.asyncIterator]();

  // 1. Push first SSE event and verify it is emitted BEFORE the stream finishes
  controller.enqueue(
    encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"El plazo vence el viernes. "}]}}]}\n\n'),
  );
  const firstStep = await iterator.next();
  expect(firstStep).toEqual({
    done: false,
    value: { type: 'text', text: 'El plazo vence el viernes. ' },
  });

  // 2. Push second SSE event containing text plus a partial prefix of [FUENTES:
  controller.enqueue(
    encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"Se entrega en ventanilla.[FU"}]}}]}\n\n'),
  );
  const secondStep = await iterator.next();
  expect(secondStep).toEqual({
    done: false,
    value: { type: 'text', text: 'Se entrega en ventanilla.' },
  });

  // 3. Push the rest of the split [FUENTES: ...] marker across two more SSE chunks and close
  controller.enqueue(
    encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"ENTES: chunk-1, "}]}}]}\n\n'),
  );
  controller.enqueue(
    encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"chunk-2, chunk-falso]"}]}}]}\n\n'),
  );
  controller.close();

  const thirdStep = await iterator.next();
  expect(thirdStep).toEqual({
    done: false,
    value: { type: 'final', citations: ['chunk-1', 'chunk-2'] },
  });

  const endStep = await iterator.next();
  expect(endStep.done).toBe(true);
});

test('GeminiAnswerGenerator produces empty citations when evidence is insufficient', async () => {
  const mockFetch = vi.fn<typeof fetch>(async () => {
    const ssePayload = [
      `data: {"candidates":[{"content":{"parts":[{"text":"${NO_EVIDENCE_MESSAGE}"}]}}]}\n\n`,
    ].join('');

    return new Response(ssePayload, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });

  const generator = createGeminiAnswerGenerator({
    apiKey: 'test-api-key',
    fetch: mockFetch,
  });

  const sources: AnswerSource[] = [
    { id: 'chunk-1', documentId: 'doc-1', page: 1, text: 'Información sobre astronomía.', score: 0.9 },
  ];

  const events = [];
  for await (const event of generator.stream('¿Cuál es la capital de Francia?', sources)) {
    events.push(event);
  }

  expect(events).toEqual([
    { type: 'text', text: NO_EVIDENCE_MESSAGE },
    { type: 'final', citations: [] },
  ]);
});

test('GeminiAnswerGenerator handles empty sources immediately without calling remote API', async () => {
  const mockFetch = vi.fn<typeof fetch>();
  const generator = createGeminiAnswerGenerator({
    apiKey: 'test-api-key',
    fetch: mockFetch,
  });

  const events = [];
  for await (const event of generator.stream('¿Pregunta?', [])) {
    events.push(event);
  }

  expect(mockFetch).not.toHaveBeenCalled();
  expect(events).toEqual([
    { type: 'text', text: NO_EVIDENCE_MESSAGE },
    { type: 'final', citations: [] },
  ]);
});

test('Gemini generation adapter does not import React or HTTP server modules', async () => {
  const source = await readFile(
    new URL('../../src/rag/providers/gemini-generation.ts', import.meta.url),
    'utf8',
  );
  const imports = ts
    .preProcessFile(source, true, true)
    .importedFiles.map(({ fileName }) => fileName);

  for (const specifier of imports) {
    expect(specifier).not.toMatch(/^(react|next|node:http)/);
  }
});

