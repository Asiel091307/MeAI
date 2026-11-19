// Builds the configured embedding provider and answer generator (spec 012, RF-012-1).
import { type AiConfig, privacyOf } from './ai-config';
import type { DocumentEmbeddingProvider, EmbeddingProvider } from './embeddings';
import { createGeminiEmbeddingProvider } from './gemini-embeddings';
import { createGeminiAnswerGenerator } from './gemini-generation';
import type { AnswerGenerator } from './generation';
import { createOpenAiCompatibleEmbeddingProvider } from './openai-compatible-embeddings';
import { createOpenAiCompatibleAnswerGenerator } from './openai-compatible-generation';

type Fetch = typeof fetch;

// A required key that is missing stops the task with the variable to set, never with a key value.
function requireKey(config: AiConfig, task: 'embedding' | 'generation'): string {
  const settings = config[task];
  if (settings.apiKey) return settings.apiKey;
  if (privacyOf(settings, config.geminiTier) === 'local') return '';
  const variable = settings.provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
  throw new Error(`${variable} is required for ${task}: set it in .env (see .env.example)`);
}

export function createEmbeddingProvider(
  config: AiConfig,
  fetchFn?: Fetch,
): EmbeddingProvider & DocumentEmbeddingProvider {
  const { provider, model, baseUrl, dimensions } = config.embedding;
  const apiKey = requireKey(config, 'embedding');
  if (provider === 'gemini') {
    // Gemini always asks for a size; ai-config defaults it to 1536.
    return createGeminiEmbeddingProvider({ apiKey, model, baseUrl, dimensions: dimensions ?? 1536, fetch: fetchFn });
  }
  return createOpenAiCompatibleEmbeddingProvider({ apiKey, model, baseUrl, dimensions, fetch: fetchFn });
}

export function createAnswerGenerator(config: AiConfig, fetchFn?: Fetch): AnswerGenerator {
  const { provider, model, baseUrl } = config.generation;
  const apiKey = requireKey(config, 'generation');
  if (provider === 'gemini') {
    return createGeminiAnswerGenerator({ apiKey, model, baseUrl, fetch: fetchFn });
  }
  return createOpenAiCompatibleAnswerGenerator({ apiKey, model, baseUrl, fetch: fetchFn });
}
