import { NextResponse } from 'next/server';
import type { DocumentRepository } from '../../../../src/db/contracts';
import { getPool } from '../../../../src/db/pool';
import { createPostgresDocumentRepository } from '../../../../src/db/postgres-documents';
import { createPostgresSearchRepository } from '../../../../src/db/postgres-search';
import {
  type ActiveQuestionGuard,
  createActiveQuestionGuard,
} from '../../../../src/rag/answering/active-question-guard';
import { validateAvailableDocuments } from '../../../../src/rag/answering/available-documents-guard';
import {
  type ChatTurn,
  contextualizeFollowUpQuestion,
} from '../../../../src/rag/answering/conversation-context';
import {
  type ChatAnswerStreamEvent,
  type DependentQueryCoordinator,
  defaultDependentQueryCoordinator,
  streamCancellableAnswer,
} from '../../../../src/rag/answering/dependent-query-cancellation';
import { validateQuestion } from '../../../../src/rag/answering/question-validation';
import { loadAiConfig } from '../../../../src/rag/providers/ai-config';
import { loadRagConfig } from '../../../../src/rag/config';
import type { EmbeddingProvider } from '../../../../src/rag/providers/embeddings';
import { createAnswerGenerator, createEmbeddingProvider } from '../../../../src/rag/providers/factory';
import type { AnswerGenerator } from '../../../../src/rag/providers/generation';
import type { ChunkSearchRepository } from '../../../../src/rag/retrieval/contracts';
import { searchQuestion } from '../../../../src/rag/retrieval/search-question';

export interface ChatAnswersRequestBody {
  question?: unknown;
  history?: unknown;
  deletedDocumentIds?: unknown;
}

export interface ChatAnswersHandlerDeps {
  documents: Pick<DocumentRepository, 'list'>;
  embeddings: EmbeddingProvider;
  search: ChunkSearchRepository;
  generator: AnswerGenerator;
  topK: number;
  guard?: ActiveQuestionGuard;
  coordinator?: DependentQueryCoordinator;
}

const defaultGuard = createActiveQuestionGuard();
let testDepsOverride: ChatAnswersHandlerDeps | null = null;

export function setChatAnswersDepsForTesting(deps: ChatAnswersHandlerDeps | null): void {
  testDepsOverride = deps;
}

export function parseChatAnswerSseEvents(rawSse: string): ChatAnswerStreamEvent[] {
  const events: ChatAnswerStreamEvent[] = [];
  for (const line of rawSse.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const jsonText = trimmed.slice(5).trim();
    if (!jsonText) continue;
    events.push(JSON.parse(jsonText) as ChatAnswerStreamEvent);
  }
  return events;
}

export function createPostChatAnswersHandler(deps: ChatAnswersHandlerDeps) {
  const guard = deps.guard ?? defaultGuard;
  const coordinator = deps.coordinator ?? defaultDependentQueryCoordinator;

  return async function handlePostChatAnswers(request: Request): Promise<Response> {
    let body: ChatAnswersRequestBody;
    try {
      body = (await request.json()) as ChatAnswersRequestBody;
    } catch {
      return NextResponse.json(
        { error: 'La solicitud de consulta no tiene un formato JSON válido.', retryable: false },
        { status: 400 },
      );
    }

    const rawQuestion = typeof body.question === 'string' ? body.question : '';
    const questionValidation = validateQuestion(rawQuestion);
    if (!questionValidation.valid) {
      return NextResponse.json(
        { error: questionValidation.reason, retryable: false },
        { status: 400 },
      );
    }

    const beginAttempt = guard.beginSearching();
    if (!beginAttempt.allowed) {
      return NextResponse.json(
        { error: beginAttempt.reason, retryable: true },
        { status: 409 },
      );
    }

    let documentList;
    try {
      documentList = await deps.documents.list();
    } catch {
      guard.finish();
      return NextResponse.json(
        {
          error: 'No se pudo comprobar la disponibilidad de tus documentos. Inténtalo de nuevo.',
          retryable: true,
        },
        { status: 500 },
      );
    }

    const availability = validateAvailableDocuments(documentList);
    if (!availability.valid) {
      guard.finish();
      return NextResponse.json(
        { error: availability.reason, retryable: false },
        { status: 400 },
      );
    }

    const documentNames = new Map<string, string>();
    for (const doc of documentList) {
      documentNames.set(doc.id, doc.name);
    }

    const history: ChatTurn[] = Array.isArray(body.history) ? (body.history as ChatTurn[]) : [];
    const deletedDocIds = new Set<string>(
      Array.isArray(body.deletedDocumentIds)
        ? body.deletedDocumentIds.filter((id): id is string => typeof id === 'string')
        : [],
    );

    const { searchQuery, generationPrompt } = contextualizeFollowUpQuestion(
      rawQuestion.trim(),
      history,
      deletedDocIds,
    );

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of streamCancellableAnswer({
            question: searchQuery,
            generationPrompt,
            coordinator,
            documentNames,
            search: async (query) => {
              const result = await searchQuestion(query, {
                documents: deps.documents,
                embeddings: deps.embeddings,
                search: deps.search,
                topK: deps.topK,
              });
              if (result.ok) {
                guard.enterGenerating();
              }
              return result;
            },
            generator: deps.generator,
          })) {
            const sseChunk = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(sseChunk));
          }
        } finally {
          guard.finish();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      },
    });
  };
}

function getDefaultChatAnswersDeps(): ChatAnswersHandlerDeps {
  if (testDepsOverride) {
    return testDepsOverride;
  }
  const pool = getPool();
  const config = loadRagConfig();
  const ai = loadAiConfig();
  return {
    documents: createPostgresDocumentRepository(pool),
    embeddings: createEmbeddingProvider(ai),
    search: createPostgresSearchRepository(pool, { embeddingModel: ai.embedding.model }),
    generator: createAnswerGenerator(ai),
    topK: config.retrievalTopK,
    guard: defaultGuard,
    coordinator: defaultDependentQueryCoordinator,
  };
}

export async function handleDefaultPostChatAnswers(request: Request): Promise<Response> {
  const deps = getDefaultChatAnswersDeps();
  return createPostChatAnswersHandler(deps)(request);
}
