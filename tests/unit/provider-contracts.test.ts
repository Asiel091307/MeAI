import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import ts from 'typescript';
import type { EmbeddingProvider } from '../../src/rag/providers/embeddings';
import type { OcrProvider } from '../../src/rag/providers/ocr';
import type { AnswerEvent, AnswerGenerator, AnswerSource } from '../../src/rag/providers/generation';

test('RAG use cases can combine independent provider contracts without a concrete model', async () => {
  const embedding: EmbeddingProvider = {
    embed: async (text) => text === 'pregunta' ? [0.2, -0.4] : [0, 0],
  };
  const ocr: OcrProvider = {
    recognize: async (image, languages) => image.length && languages.includes('es')
      ? 'Texto reconocido' : '',
  };
  const source: AnswerSource = {
    id: 'chunk-1', documentId: 'document-1', page: 2, text: 'Texto reconocido',
  };
  const generator: AnswerGenerator = {
    async *stream(question, sources) {
      expect(question).toBe('pregunta');
      expect(sources).toEqual([source]);
      yield { type: 'text', text: 'Respuesta basada en ' };
      yield { type: 'text', text: sources[0].text };
      yield { type: 'final', citations: [sources[0].id] };
    },
  };

  expect(await embedding.embed('pregunta')).toEqual([0.2, -0.4]);
  expect(await ocr.recognize(Uint8Array.from([1, 2]), ['es', 'en']))
    .toBe(source.text);

  const events: AnswerEvent[] = [];
  for await (const event of generator.stream('pregunta', [source])) {
    events.push(event);
  }
  expect(events).toEqual([
    { type: 'text', text: 'Respuesta basada en ' },
    { type: 'text', text: 'Texto reconocido' },
    { type: 'final', citations: ['chunk-1'] },
  ]);
});

test('provider contracts import neither the UI, HTTP, nor any concrete provider', async () => {
  for (const file of ['embeddings.ts', 'ocr.ts', 'generation.ts']) {
    const source = await readFile(new URL(`../../src/rag/providers/${file}`, import.meta.url), 'utf8');
    const imports = ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName);
    expect(imports).toEqual([]);
  }
});
