import type { AnswerGenerator } from '../providers/generation';
import type { RetrievedChunk } from '../retrieval/contracts';
import type { ResolvedCitation } from './citation-validation';
import {
  type CollectedGroundedAnswer,
  collectGroundedAnswerFromChunks,
} from './grounded-answer';

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: ResolvedCitation[];
}

export interface ContextualizedQuestion {
  searchQuery: string;
  generationPrompt: string;
}

const MAX_CONTEXT_USER_TURNS = 3;

// Filters out turns whose cited documents were all deleted so deleted content is never reused.
export function filterActiveHistoryTurns(
  history: readonly ChatTurn[],
  deletedDocumentIds?: ReadonlySet<string>,
): ChatTurn[] {
  const activeTurns: ChatTurn[] = [];

  for (let i = 0; i < history.length; i++) {
    const turn = history[i];
    if (turn.role === 'assistant' && turn.citations && turn.citations.length > 0) {
      const hasAnyAvailableCitation = turn.citations.some(
        (c) => c.available && (!deletedDocumentIds || !deletedDocumentIds.has(c.documentId)),
      );
      if (!hasAnyAvailableCitation) {
        // Also drop the preceding user turn if its entire answer came from a deleted document
        if (activeTurns.length > 0 && activeTurns[activeTurns.length - 1].role === 'user') {
          activeTurns.pop();
        }
        continue;
      }
    }
    activeTurns.push(turn);
  }

  return activeTurns;
}

export function contextualizeFollowUpQuestion(
  question: string,
  history: readonly ChatTurn[],
  deletedDocumentIds?: ReadonlySet<string>,
): ContextualizedQuestion {
  const trimmedQuestion = question.trim();
  const activeHistory = filterActiveHistoryTurns(history, deletedDocumentIds);

  const recentUserQuestions = activeHistory
    .filter((turn) => turn.role === 'user' && turn.content.trim().length > 0)
    .slice(-MAX_CONTEXT_USER_TURNS)
    .map((turn) => turn.content.trim());

  if (recentUserQuestions.length === 0) {
    return {
      searchQuery: trimmedQuestion,
      generationPrompt: trimmedQuestion,
    };
  }

  const searchQuery = `${recentUserQuestions.join(' ')} ${trimmedQuestion}`.slice(0, 1000);

  const historySummary = recentUserQuestions
    .map((q, idx) => `Turno previo ${idx + 1} (usuario): ${q}`)
    .join('\n');

  const generationPrompt = [
    'Contexto de referencia de la conversación (SOLO para interpretar referencias como pronombres o temas previos; NUNCA lo uses como evidencia documental. Los fragmentos recuperados vigentes tienen prioridad absoluta sobre cualquier afirmación previa del historial):',
    historySummary,
    '',
    `Pregunta actual del usuario: ${trimmedQuestion}`,
  ].join('\n');

  return {
    searchQuery,
    generationPrompt,
  };
}

export interface AnswerConversationalQuestionOptions {
  question: string;
  history: readonly ChatTurn[];
  search: (searchQuery: string) => Promise<readonly RetrievedChunk[]>;
  generator: AnswerGenerator;
  documentNames?: ReadonlyMap<string, string>;
  deletedDocumentIds?: ReadonlySet<string>;
}

export async function answerConversationalQuestion({
  question,
  history,
  search,
  generator,
  documentNames,
  deletedDocumentIds,
}: AnswerConversationalQuestionOptions): Promise<CollectedGroundedAnswer> {
  const { searchQuery, generationPrompt } = contextualizeFollowUpQuestion(
    question,
    history,
    deletedDocumentIds,
  );

  // Always run a fresh search over currently available documents (RF-3, RF-5).
  const chunks = await search(searchQuery);

  // Only freshly retrieved chunks are passed as sources; historical assistant answers are never sources.
  return collectGroundedAnswerFromChunks({
    question: generationPrompt,
    chunks,
    generator,
    documentNames,
  });
}

// T57: Keeps visible messages in the tab session, but marks citations of a deleted document as unavailable.
export function invalidateDeletedDocumentCitations(
  history: readonly ChatTurn[],
  deletedDocumentId: string,
): ChatTurn[] {
  return history.map((turn) => {
    if (!turn.citations || turn.citations.length === 0) {
      return turn;
    }

    const updatedCitations = turn.citations.map((citation) =>
      citation.documentId === deletedDocumentId
        ? { ...citation, available: false }
        : citation,
    );

    return {
      ...turn,
      citations: updatedCitations,
    };
  });
}
