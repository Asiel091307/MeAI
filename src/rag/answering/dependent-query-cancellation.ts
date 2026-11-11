import type { AnswerGenerator } from '../providers/generation';
import type { SearchQuestionResult } from '../retrieval/search-question';
import { toAnswerSource } from '../retrieval/to-answer-source';
import { type ResolvedCitation, resolveCitations } from './citation-validation';
import { streamGroundedAnswer } from './grounded-answer';

export const DELETED_DOCUMENT_CANCELLATION_REASON =
  'La consulta fue cancelada porque se eliminó un documento del que dependía la respuesta.';

export const REPROCESSING_DOCUMENT_CANCELLATION_REASON =
  'La consulta fue cancelada porque uno de los documentos consultados comenzó a reprocesarse.';

export const GENERATION_FAILED_REASON =
  'No se pudo generar la respuesta en este momento. Inténtalo de nuevo.';

export type ChatAnswerStreamEvent =
  | { type: 'status'; phase: 'searching' | 'generating'; message: string }
  | { type: 'text'; text: string }
  | { type: 'final'; text: string; citations: ResolvedCitation[] }
  | { type: 'error'; error: string; retryable: boolean; discardPartialText: boolean };

export type CancellationState =
  | { cancelled: false }
  | { cancelled: true; cause: 'deleted' | 'reprocessing'; documentId: string; reason: string };

export interface QuerySession {
  registerDependentDocuments(documentIds: readonly string[]): void;
  getCancellation(): CancellationState;
  close(): void;
}

export interface DependentQueryCoordinator {
  startQuery(): QuerySession;
  notifyDocumentDeleted(documentId: string): void;
  notifyDocumentReprocessing(documentId: string): void;
}

interface InternalQuerySession {
  phase: 'searching' | 'generating' | 'closed';
  dependentDocumentIds: Set<string>;
  invalidatedDuringSearch: Map<string, { cause: 'deleted' | 'reprocessing'; reason: string }>;
  cancellation: CancellationState;
}

export function createDependentQueryCoordinator(): DependentQueryCoordinator {
  const activeSessions = new Set<InternalQuerySession>();

  const invalidateSessionIfNeeded = (
    session: InternalQuerySession,
    documentId: string,
    cause: 'deleted' | 'reprocessing',
    reason: string,
  ) => {
    if (session.cancellation.cancelled || session.phase === 'closed') {
      return;
    }

    if (session.phase === 'searching') {
      session.invalidatedDuringSearch.set(documentId, { cause, reason });
      return;
    }

    if (session.dependentDocumentIds.has(documentId)) {
      session.cancellation = {
        cancelled: true,
        cause,
        documentId,
        reason,
      };
    }
  };

  return {
    startQuery(): QuerySession {
      const internal: InternalQuerySession = {
        phase: 'searching',
        dependentDocumentIds: new Set<string>(),
        invalidatedDuringSearch: new Map(),
        cancellation: { cancelled: false },
      };

      activeSessions.add(internal);

      return {
        registerDependentDocuments(documentIds: readonly string[]) {
          internal.phase = 'generating';
          for (const docId of documentIds) {
            internal.dependentDocumentIds.add(docId);
            const priorInvalidation = internal.invalidatedDuringSearch.get(docId);
            if (priorInvalidation && !internal.cancellation.cancelled) {
              internal.cancellation = {
                cancelled: true,
                cause: priorInvalidation.cause,
                documentId: docId,
                reason: priorInvalidation.reason,
              };
            }
          }
        },
        getCancellation() {
          return internal.cancellation;
        },
        close() {
          internal.phase = 'closed';
          activeSessions.delete(internal);
        },
      };
    },
    notifyDocumentDeleted(documentId: string) {
      for (const session of activeSessions) {
        invalidateSessionIfNeeded(
          session,
          documentId,
          'deleted',
          DELETED_DOCUMENT_CANCELLATION_REASON,
        );
      }
    },
    notifyDocumentReprocessing(documentId: string) {
      for (const session of activeSessions) {
        invalidateSessionIfNeeded(
          session,
          documentId,
          'reprocessing',
          REPROCESSING_DOCUMENT_CANCELLATION_REASON,
        );
      }
    },
  };
}

export const defaultDependentQueryCoordinator = createDependentQueryCoordinator();

export interface StreamCancellableAnswerOptions {
  question: string;
  generationPrompt?: string;
  coordinator?: DependentQueryCoordinator;
  search: (query: string) => Promise<SearchQuestionResult>;
  generator: AnswerGenerator;
  documentNames?: ReadonlyMap<string, string>;
}

export async function* streamCancellableAnswer({
  question,
  generationPrompt,
  coordinator = defaultDependentQueryCoordinator,
  search,
  generator,
  documentNames,
}: StreamCancellableAnswerOptions): AsyncIterable<ChatAnswerStreamEvent> {
  const session = coordinator.startQuery();

  try {
    yield {
      type: 'status',
      phase: 'searching',
      message: 'Buscando evidencia en tus documentos disponibles...',
    };

    const searchResult = await search(question);

    if (!searchResult.ok) {
      yield {
        type: 'error',
        error: searchResult.reason,
        retryable: searchResult.retryable,
        discardPartialText: true,
      };
      return;
    }

    const dependentDocIds = Array.from(new Set(searchResult.chunks.map((c) => c.documentId)));
    session.registerDependentDocuments(dependentDocIds);

    const postSearchCancellation = session.getCancellation();
    if (postSearchCancellation.cancelled) {
      yield {
        type: 'error',
        error: postSearchCancellation.reason,
        retryable: true,
        discardPartialText: true,
      };
      return;
    }

    yield {
      type: 'status',
      phase: 'generating',
      message: 'Generando respuesta fundamentada...',
    };

    const sources = searchResult.chunks.map(toAnswerSource);
    let accumulatedText = '';

    try {
      for await (const event of streamGroundedAnswer({
        question: generationPrompt ?? question,
        sources,
        generator,
      })) {
        const midStreamCancellation = session.getCancellation();
        if (midStreamCancellation.cancelled) {
          yield {
            type: 'error',
            error: midStreamCancellation.reason,
            retryable: true,
            discardPartialText: true,
          };
          return;
        }

        if (event.type === 'text') {
          accumulatedText += event.text;
          yield { type: 'text', text: event.text };
        } else if (event.type === 'final') {
          const finalCancellation = session.getCancellation();
          if (finalCancellation.cancelled) {
            yield {
              type: 'error',
              error: finalCancellation.reason,
              retryable: true,
              discardPartialText: true,
            };
            return;
          }

          const resolvedCitations = resolveCitations(event.citations, sources, documentNames);
          yield {
            type: 'final',
            text: accumulatedText,
            citations: resolvedCitations,
          };
        }
      }
    } catch {
      yield {
        type: 'error',
        error: GENERATION_FAILED_REASON,
        retryable: true,
        discardPartialText: true,
      };
    }
  } finally {
    session.close();
  }
}
