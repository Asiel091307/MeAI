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

const CITATION_PATTERN = /\[(?:FUENTES|CITAS):\s*([^\]]+)\]/i;

function extractCitations(text: string, validIds: Set<string>): { cleanText: string; citations: string[] } {
  const match = CITATION_PATTERN.exec(text);
  if (!match) {
    return { cleanText: text, citations: [] };
  }

  const rawCitations = match[1]
    .split(',')
    .map((c) => c.trim())
    .filter((id) => validIds.has(id));

  const cleanText = text.replace(CITATION_PATTERN, '').trimEnd();
  return { cleanText, citations: rawCitations };
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
      let buffer = '';
      let accumulatedText = '';
      const pendingTextChunks: string[] = [];

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);
              const partText = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (partText) {
                accumulatedText += partText;
                pendingTextChunks.push(partText);
              }
            } catch {
              // Ignore incomplete or unparseable SSE lines
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Check if evidence is insufficient
      const isNoEvidence =
        accumulatedText.includes(NO_EVIDENCE_MESSAGE) ||
        accumulatedText.toLowerCase().includes('no contiene información suficiente') ||
        accumulatedText.toLowerCase().includes('no hay información suficiente');

      if (isNoEvidence) {
        yield { type: 'text', text: NO_EVIDENCE_MESSAGE };
        yield { type: 'final', citations: [] };
        return;
      }

      // Extract and strip citations from emitted text
      const { citations } = extractCitations(accumulatedText, validIds);

      for (const chunk of pendingTextChunks) {
        const cleanedChunk = chunk.replace(CITATION_PATTERN, '');
        if (cleanedChunk) {
          yield { type: 'text', text: cleanedChunk };
        }
      }

      yield { type: 'final', citations };
    },
  };
}
