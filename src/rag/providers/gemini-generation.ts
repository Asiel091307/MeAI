import type {
  AnswerEvent,
  AnswerGenerator,
  AnswerSource,
} from './generation';

export const NO_EVIDENCE_MESSAGE =
  'El contexto recuperado no contiene información suficiente para responder a la pregunta.';

const SYSTEM_INSTRUCTION = `Eres MeAI, un asistente RAG educativo y riguroso.
Tu función es responder a la pregunta del usuario utilizando EXCLUSIVAMENTE la evidencia documental explícita de los fragmentos recuperados vigentes que se te proporcionan.

Reglas innegociables:
1. Responde siempre en español.
2. Basa tus afirmaciones únicamente en el contenido de los fragmentos. No agregues conocimiento general, ni suposiciones, ni información no respaldada por ellos.
3. Si los fragmentos recuperados no contienen información suficiente o relevante para responder con certeza a la pregunta, responde EXACTAMENTE:
"${NO_EVIDENCE_MESSAGE}"
No agregues explicaciones adicionales, ni disculpas, ni citas en ese caso.
4. Si los fragmentos contienen información suficiente, redacta una respuesta clara y fundamentada. Al final de tu respuesta, en una línea separada, lista los identificadores de los fragmentos que respaldaron directamente tu respuesta con este formato exacto:
[FUENTES: id1, id2]`;

export interface GeminiGeneratorOptions {
  apiKey?: string;
  model?: string;
  fetch?: typeof fetch;
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
  let working = pendingBuffer.replace(COMPLETE_CITATION_PATTERN, (_fullMatch, group1: string) => {
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

export function createGeminiAnswerGenerator(options: GeminiGeneratorOptions = {}): AnswerGenerator {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? '';
  const model = options.model ?? process.env.GENERATION_MODEL ?? 'gemini-3.5-flash-lite';

  return {
    async *stream(question: string, sources: readonly AnswerSource[]): AsyncIterable<AnswerEvent> {
      if (sources.length === 0) {
        yield { type: 'text', text: NO_EVIDENCE_MESSAGE };
        yield { type: 'final', citations: [] };
        return;
      }

      const validIds = new Set(sources.map((s) => s.id));
      const formattedSources = sources
        .map((s, idx) => `[Fragmento ${idx + 1} (id: ${s.id}, doc: ${s.documentId}, pág: ${s.page})]:\n${s.text}`)
        .join('\n\n');

      const userPrompt = `Pregunta del usuario:\n${question}\n\nFragmentos recuperados vigentes:\n${formattedSources}`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let pendingTextBuffer = '';
      let accumulatedText = '';
      let emittedAnyText = false;
      const collectedCitations: string[] = [];

      const parseSseLine = (line: string): string | null => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) return null;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) return null;
        try {
          const data = JSON.parse(jsonStr);
          return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
        } catch {
          return null;
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() ?? '';

          for (const line of lines) {
            const partText = parseSseLine(line);
            if (!partText) continue;

            accumulatedText += partText;
            pendingTextBuffer += partText;

            const drained = drainPendingBuffer(pendingTextBuffer, validIds, collectedCitations, false);
            pendingTextBuffer = drained.remainingBuffer;
            if (drained.emitText) {
              emittedAnyText = true;
              yield { type: 'text', text: drained.emitText };
            }
          }
        }

        if (sseBuffer.trim()) {
          const partText = parseSseLine(sseBuffer);
          if (partText) {
            accumulatedText += partText;
            pendingTextBuffer += partText;
          }
        }
      } finally {
        reader.releaseLock();
      }

      const finalDrain = drainPendingBuffer(pendingTextBuffer, validIds, collectedCitations, true);
      if (finalDrain.emitText) {
        emittedAnyText = true;
        yield { type: 'text', text: finalDrain.emitText };
      }

      const isNoEvidence =
        accumulatedText.includes(NO_EVIDENCE_MESSAGE) ||
        accumulatedText.toLowerCase().includes('no contiene información suficiente') ||
        accumulatedText.toLowerCase().includes('no hay información suficiente');

      if (isNoEvidence) {
        if (!emittedAnyText) {
          yield { type: 'text', text: NO_EVIDENCE_MESSAGE };
        }
        yield { type: 'final', citations: [] };
        return;
      }

      yield { type: 'final', citations: collectedCitations };
    },
  };
}
