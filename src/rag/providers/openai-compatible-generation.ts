import type { AnswerEvent, AnswerGenerator, AnswerSource } from './generation';
import {
  buildGroundedUserPrompt,
  CitationFilter,
  GROUNDED_SYSTEM_INSTRUCTION,
  NO_EVIDENCE_MESSAGE,
} from './grounded-prompt';

export interface OpenAiCompatibleGeneratorOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
}

export function createOpenAiCompatibleAnswerGenerator(
  options: OpenAiCompatibleGeneratorOptions,
): AnswerGenerator {
  const { apiKey, model } = options;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  return {
    async *stream(question: string, sources: readonly AnswerSource[]): AsyncIterable<AnswerEvent> {
      if (sources.length === 0) {
        yield { type: 'text', text: NO_EVIDENCE_MESSAGE };
        yield { type: 'final', citations: [] };
        return;
      }

      const doFetch = options.fetch ?? globalThis.fetch;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const response = await doFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          stream: true,
          messages: [
            { role: 'system', content: GROUNDED_SYSTEM_INSTRUCTION },
            { role: 'user', content: buildGroundedUserPrompt(question, sources) },
          ],
        }),
      });

      if (!response.ok || !response.body) {
        const detail = response.ok ? '' : await readErrorMessage(response, apiKey);
        throw new Error(
          `Generation request failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const filter = new CitationFilter(sources);
      let sseBuffer = '';
      let finished = false;

      // Returns the text delta of one SSE line, or null; sets `finished` on [DONE].
      const parseSseLine = (line: string): string | null => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) return null;
        const payload = trimmed.slice(5).trim();
        if (!payload) return null;
        if (payload === '[DONE]') {
          finished = true;
          return null;
        }
        try {
          const content = JSON.parse(payload)?.choices?.[0]?.delta?.content;
          return typeof content === 'string' && content ? content : null;
        } catch {
          return null;
        }
      };

      let trailing = '';
      try {
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() ?? '';

          for (const line of lines) {
            const delta = parseSseLine(line);
            if (!delta) continue;
            const clean = filter.push(delta);
            if (clean) yield { type: 'text', text: clean };
          }
        }

        if (!finished && sseBuffer.trim()) {
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

async function readErrorMessage(response: Response, apiKey: string): Promise<string> {
  let message = response.statusText || '';
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text)?.error;
      message = (typeof parsed === 'string' ? parsed : parsed?.message) ?? text;
    } catch {
      message = text || message;
    }
  } catch {
    // Keep the status text when the body cannot be read.
  }
  const safe = String(message);
  return apiKey ? safe.split(apiKey).join('[redacted]') : safe;
}
