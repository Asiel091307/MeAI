import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import {
  NO_EVIDENCE_ANSWER,
  streamGroundedAnswer,
} from '../../src/rag/answering/grounded-answer';
import type {
  AnswerEvent,
  AnswerGenerator,
  AnswerSource,
} from '../../src/rag/providers/generation';

test('streamGroundedAnswer responds with explicit Spanish message and no citations when no sources are retrieved', async () => {
  const mockGenerator: AnswerGenerator = {
    stream: vi.fn(async function* () {}),
  };

  const events: AnswerEvent[] = [];
  for await (const event of streamGroundedAnswer({
    question: '¿De qué color es el cielo?',
    sources: [],
    generator: mockGenerator,
  })) {
    events.push(event);
  }

  expect(mockGenerator.stream).not.toHaveBeenCalled();
  expect(events).toEqual([
    { type: 'text', text: NO_EVIDENCE_ANSWER },
    { type: 'final', citations: [] },
  ]);
});

test('streamGroundedAnswer produces no documentary claims and zero citations when context is irrelevant', async () => {
  const irrelevantSources: AnswerSource[] = [
    {
      id: 'chunk-astronomy-1',
      documentId: 'doc-1',
      page: 2,
      text: 'Los cometas están compuestos de hielo, polvo y rocas.',
      score: 0.9,
    },
  ];

  const mockGenerator: AnswerGenerator = {
    async *stream() {
      yield { type: 'text', text: NO_EVIDENCE_ANSWER };
      yield { type: 'final', citations: [] };
    },
  };

  const events: AnswerEvent[] = [];
  for await (const event of streamGroundedAnswer({
    question: '¿Cuál es la tasa de interés del préstamo hipotecario?',
    sources: irrelevantSources,
    generator: mockGenerator,
  })) {
    events.push(event);
  }

  expect(events).toEqual([
    { type: 'text', text: NO_EVIDENCE_ANSWER },
    { type: 'final', citations: [] },
  ]);
});

test('streamGroundedAnswer discards invented citations and preserves only valid retrieved sources', async () => {
  const validSource: AnswerSource = {
    id: 'chunk-1',
    documentId: 'doc-1',
    page: 1,
    text: 'El horario de atención es de 9 a 17 horas.',
    score: 0.9,
  };

  const mockGenerator: AnswerGenerator = {
    async *stream() {
      yield { type: 'text', text: 'El horario de atención es de 9 a 17 horas.' };
      // Attempting to cite an invented source ID not present in retrieved sources
      yield { type: 'final', citations: ['chunk-1', 'chunk-inventado-99'] };
    },
  };

  const events: AnswerEvent[] = [];
  for await (const event of streamGroundedAnswer({
    question: '¿Cuál es el horario?',
    sources: [validSource],
    generator: mockGenerator,
  })) {
    events.push(event);
  }

  expect(events).toEqual([
    { type: 'text', text: 'El horario de atención es de 9 a 17 horas.' },
    { type: 'final', citations: ['chunk-1'] },
  ]);
});

test('grounded answer module does not import React or HTTP server modules', async () => {
  const source = await readFile(
    new URL('../../src/rag/answering/grounded-answer.ts', import.meta.url),
    'utf8',
  );
  const imports = ts
    .preProcessFile(source, true, true)
    .importedFiles.map(({ fileName }) => fileName);

  for (const specifier of imports) {
    expect(specifier).not.toMatch(/^(react|next|node:http)/);
  }
});

