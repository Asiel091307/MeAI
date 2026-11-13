import { expect, test, vi } from 'vitest';
import {
  answerConversationalQuestion,
  type ChatTurn,
  contextualizeFollowUpQuestion,
} from '../../src/rag/answering/conversation-context';
import type { AnswerEvent, AnswerGenerator, AnswerSource } from '../../src/rag/providers/generation';
import type { RetrievedChunk } from '../../src/rag/retrieval/contracts';

test('contextualizeFollowUpQuestion resolves conversational references for search without turning history into evidence (T48)', async () => {
  const history: ChatTurn[] = [
    {
      id: 'turn-1',
      role: 'user',
      content: '¿Cuáles son los requisitos de la Beca Excelencia?',
    },
    {
      id: 'turn-2',
      role: 'assistant',
      content: 'Se requiere promedio de 9.0 y constancia de estudios.',
      citations: [
        {
          chunkId: 'chunk-old',
          documentId: 'doc-becas',
          page: 1,
          text: 'Se requiere promedio de 9.0 y constancia de estudios.',
          score: 0.9,
          available: true,
        },
      ],
    },
  ];

  const contextualized = contextualizeFollowUpQuestion(
    '¿Y cuándo se entregan los documentos?',
    history,
  );

  // Search query includes the previous user topic so semantic search resolves the reference
  expect(contextualized.searchQuery).toContain('Beca Excelencia');
  expect(contextualized.searchQuery).toContain('¿Y cuándo se entregan los documentos?');

  // Now verify answerConversationalQuestion performs a fresh search and only passes retrieved chunks as sources
  let searchedQuery = '';
  let generatorSources: readonly AnswerSource[] = [];

  const freshChunks: RetrievedChunk[] = [
    {
      chunkId: 'chunk-current-p4',
      documentId: 'doc-becas',
      page: 4,
      text: 'Para la Beca Excelencia, los documentos se entregan del 1 al 15 de septiembre.',
      score: 0.93,
    },
  ];

  const fakeSearch = vi.fn(async (query: string) => {
    searchedQuery = query;
    return freshChunks;
  });

  const fakeGenerator: AnswerGenerator = {
    async *stream(_question, sources): AsyncIterable<AnswerEvent> {
      generatorSources = sources;
      yield {
        type: 'text',
        text: 'Los documentos se entregan del 1 al 15 de septiembre.',
      };
      yield {
        type: 'final',
        citations: ['chunk-current-p4'],
      };
    },
  };

  const result = await answerConversationalQuestion({
    question: '¿Y cuándo se entregan los documentos?',
    history,
    search: fakeSearch,
    generator: fakeGenerator,
  });

  // Search was invoked with the contextualized query
  expect(fakeSearch).toHaveBeenCalledTimes(1);
  expect(searchedQuery).toContain('Beca Excelencia');
  expect(searchedQuery).toContain('¿Y cuándo se entregan los documentos?');

  // Only the freshly retrieved chunk was provided as evidence to the generator (never the assistant history)
  expect(generatorSources).toEqual([
    {
      id: 'chunk-current-p4',
      documentId: 'doc-becas',
      page: 4,
      text: 'Para la Beca Excelencia, los documentos se entregan del 1 al 15 de septiembre.',
      score: 0.93,
    },
  ]);

  expect(result.text).toBe('Los documentos se entregan del 1 al 15 de septiembre.');
  expect(result.citations).toEqual([
    {
      chunkId: 'chunk-current-p4',
      documentId: 'doc-becas',
      page: 4,
      text: 'Para la Beca Excelencia, los documentos se entregan del 1 al 15 de septiembre.',
      score: 0.93,
      available: true,
    },
  ]);
});

test('prioritizes current document evidence over contradictory conversation history (T53a)', async () => {
  const contradictoryHistory: ChatTurn[] = [
    {
      id: 'turn-1',
      role: 'user',
      content: '¿Cuál es el monto mensual de la beca?',
    },
    {
      id: 'turn-2',
      role: 'assistant',
      content: 'El monto mensual de la beca es de 1,500 pesos.',
      citations: [
        {
          chunkId: 'chunk-antiguo',
          documentId: 'doc-1',
          page: 2,
          text: 'El monto mensual de la beca es de 1,500 pesos.',
          score: 0.9,
          available: true,
        },
      ],
    },
  ];

  const currentChunks: RetrievedChunk[] = [
    {
      chunkId: 'chunk-vigente-p2',
      documentId: 'doc-1',
      page: 2,
      text: 'El monto mensual vigente de la beca es de 3,000 pesos.',
      score: 0.96,
    },
  ];

  let capturedGeneratorPrompt = '';
  let capturedSources: readonly AnswerSource[] = [];

  const fakeGenerator: AnswerGenerator = {
    async *stream(questionPrompt, sources): AsyncIterable<AnswerEvent> {
      capturedGeneratorPrompt = questionPrompt;
      capturedSources = sources;
      // Even if the model attempts to cite the old historical chunk-antiguo, it must be rejected
      yield {
        type: 'text',
        text: 'Según el documento vigente, el monto mensual es de 3,000 pesos.',
      };
      yield {
        type: 'final',
        citations: ['chunk-vigente-p2', 'chunk-antiguo'],
      };
    },
  };

  const result = await answerConversationalQuestion({
    question: '¿Sigue siendo ese mismo monto mensual?',
    history: contradictoryHistory,
    search: async () => currentChunks,
    generator: fakeGenerator,
  });

  // Only current document chunks are passed as sources; historical claims are not in sources
  expect(capturedSources).toHaveLength(1);
  expect(capturedSources[0].id).toBe('chunk-vigente-p2');
  expect(capturedSources[0].text).toContain('3,000 pesos');
  expect(capturedSources[0].text).not.toContain('1,500 pesos');

  // Prompt explicitly instructs to prioritize current documentary evidence over conversation history
  expect(capturedGeneratorPrompt).toContain('prioridad');

  // Historical chunk ID 'chunk-antiguo' is rejected because it is not in current retrieved chunks
  expect(result.citationIds).toEqual(['chunk-vigente-p2']);
  expect(result.citations).toHaveLength(1);
  expect(result.citations[0].chunkId).toBe('chunk-vigente-p2');
});
