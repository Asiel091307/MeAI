import type {
  AnswerEvent,
  AnswerGenerator,
  AnswerSource,
} from './generation';
import {
  buildGroundedUserPrompt,
  CitationFilter,
  GROUNDED_SYSTEM_INSTRUCTION,
  NO_EVIDENCE_MESSAGE,
} from './grounded-prompt';

export { NO_EVIDENCE_MESSAGE };

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiGeneratorOptions {
  apiKey?: string;
  model?: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}

export function createGeminiAnswerGenerator(options: GeminiGeneratorOptions = {}): AnswerGenerator {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? '';
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const model = options.model ?? process.env.GENERATION_MODEL ?? 'gemini-3.5-flash-lite';

  return {
    async *stream(question: string, sources: readonly AnswerSource[]): AsyncIterable<AnswerEvent> {
      if (sources.length === 0) {
        yield { type: 'text', text: NO_EVIDENCE_MESSAGE };
        yield { type: 'final', citations: [] };
        return;
      }

      const userPrompt = buildGroundedUserPrompt(question, sources);

      const url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse`;
      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: GROUNDED_SYSTEM_INSTRUCTION }],
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
      const filter = new CitationFilter(sources);

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

      let trailing = '';
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

            const clean = filter.push(partText);
            if (clean) yield { type: 'text', text: clean };
          }
        }

        if (sseBuffer.trim()) {
          trailing = parseSseLine(sseBuffer) ?? '';
        }
      } finally {
        reader.releaseLock();
      }

      const result = filter.finish(trailing);
      if (result.text) yield { type: 'text', text: result.text };

      if (result.noEvidence && !result.emittedAnyText) {
        yield { type: 'text', text: NO_EVIDENCE_MESSAGE };
      }
      yield { type: 'final', citations: result.citations };
    },
  };
}
