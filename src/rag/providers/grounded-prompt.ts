import type { AnswerSource } from './generation';

// Everything here is provider-independent: the grounded prompt and the citation handling
// are the same whether the answer comes from Gemini or from an OpenAI-compatible server.

export const NO_EVIDENCE_MESSAGE =
  'El contexto recuperado no contiene información suficiente para responder a la pregunta.';

export const GROUNDED_SYSTEM_INSTRUCTION = `Eres MeAI, un asistente RAG educativo y riguroso.
Tu función es responder a la pregunta del usuario utilizando EXCLUSIVAMENTE la evidencia documental explícita de los fragmentos recuperados vigentes que se te proporcionan.

Reglas innegociables:
1. Responde siempre en español.
2. Basa tus afirmaciones únicamente en el contenido de los fragmentos. No agregues conocimiento general, ni suposiciones, ni información no respaldada por ellos.
3. Si los fragmentos recuperados no contienen información suficiente o relevante para responder con certeza a la pregunta, responde EXACTAMENTE:
"${NO_EVIDENCE_MESSAGE}"
No agregues explicaciones adicionales, ni disculpas, ni citas en ese caso.
4. Si los fragmentos contienen información suficiente, redacta una respuesta clara y fundamentada. Al final de tu respuesta, en una línea separada, lista los identificadores de los fragmentos que respaldaron directamente tu respuesta con este formato exacto:
[FUENTES: id1, id2]`;

export function buildGroundedUserPrompt(question: string, sources: readonly AnswerSource[]): string {
  const formattedSources = sources
    .map((s, idx) => `[Fragmento ${idx + 1} (id: ${s.id}, doc: ${s.documentId}, pág: ${s.page})]:\n${s.text}`)
    .join('\n\n');

  return `Pregunta del usuario:\n${question}\n\nFragmentos recuperados vigentes:\n${formattedSources}`;
}

export function isNoEvidenceText(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    text.includes(NO_EVIDENCE_MESSAGE) ||
    lower.includes('no contiene información suficiente') ||
    lower.includes('no hay información suficiente')
  );
}

const COMPLETE_CITATION_PATTERN = /\n?\[(?:FUENTES|CITAS):\s*([^\]]*)\]/gi;
const OPEN_CITATION_PATTERN = /\n?\[(?:FUENTES|CITAS):/i;

function findTrailingPartialCitationPrefix(text: string): number {
  const lastBracket = text.lastIndexOf('[');
  if (lastBracket === -1) {
    return -1;
  }

  const tail = text.slice(lastBracket).toLowerCase();
  if ('[fuentes:'.startsWith(tail) || '[citas:'.startsWith(tail)) {
    return lastBracket > 0 && text[lastBracket - 1] === '\n' ? lastBracket - 1 : lastBracket;
  }

  return -1;
}

function consumeCitationList(rawList: string, validIds: Set<string>, target: string[]): void {
  for (const item of rawList.split(',')) {
    const id = item.trim();
    if (validIds.has(id) && !target.includes(id)) {
      target.push(id);
    }
  }
}

function drainPendingBuffer(
  pendingBuffer: string,
  validIds: Set<string>,
  collectedCitations: string[],
  isFinal: boolean,
): { emitText: string; remainingBuffer: string } {
  const working = pendingBuffer.replace(COMPLETE_CITATION_PATTERN, (_fullMatch, group1: string) => {
    consumeCitationList(group1, validIds, collectedCitations);
    return '';
  });

  const openMatch = OPEN_CITATION_PATTERN.exec(working);
  if (openMatch) {
    const before = working.slice(0, openMatch.index);
    if (isFinal) {
      const unclosedList = working.slice(openMatch.index + openMatch[0].length);
      consumeCitationList(unclosedList, validIds, collectedCitations);
      return { emitText: before, remainingBuffer: '' };
    }
    return { emitText: before, remainingBuffer: working.slice(openMatch.index) };
  }

  if (!isFinal) {
    const partialIndex = findTrailingPartialCitationPrefix(working);
    if (partialIndex !== -1) {
      return {
        emitText: working.slice(0, partialIndex),
        remainingBuffer: working.slice(partialIndex),
      };
    }
  }

  return { emitText: working, remainingBuffer: '' };
}

// Feeds on raw text deltas from the model and returns clean text to show. The trailing
// "[FUENTES: id1, id2]" marker is hidden even when it arrives split across deltas, and only
// ids that belong to the retrieved sources are kept as citations.
export class CitationFilter {
  private readonly validIds: Set<string>;
  private pending = '';
  private raw = '';
  private emittedAnyText = false;
  private readonly citations: string[] = [];

  constructor(sources: readonly AnswerSource[]) {
    this.validIds = new Set(sources.map((s) => s.id));
  }

  push(delta: string): string {
    this.raw += delta;
    this.pending += delta;
    const drained = drainPendingBuffer(this.pending, this.validIds, this.citations, false);
    this.pending = drained.remainingBuffer;
    if (drained.emitText) this.emittedAnyText = true;
    return drained.emitText;
  }

  // Call once after the last delta. `trailing` is optional extra raw text, flushed together.
  finish(trailing = ''): { text: string; citations: string[]; noEvidence: boolean; emittedAnyText: boolean } {
    this.raw += trailing;
    this.pending += trailing;
    const drained = drainPendingBuffer(this.pending, this.validIds, this.citations, true);
    this.pending = '';
    if (drained.emitText) this.emittedAnyText = true;
    const noEvidence = isNoEvidenceText(this.raw);
    return {
      text: drained.emitText,
      citations: noEvidence ? [] : this.citations,
      noEvidence,
      emittedAnyText: this.emittedAnyText,
    };
  }
}
