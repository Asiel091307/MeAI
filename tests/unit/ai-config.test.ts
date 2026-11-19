import { expect, test } from 'vitest';
import { loadAiConfig, missingVariables, toPublicAiSettings } from '../../src/rag/providers/ai-config';

// Spec 012, RF-012-1 and RF-012-2.
const SECRET = 'sk-test-secret-1234567890';

test('with nothing configured, both tasks default to Gemini and report the missing key', () => {
  const config = loadAiConfig({});
  expect(config.embedding).toEqual({
    provider: 'gemini',
    model: 'gemini-embedding-001',
    dimensions: 1536,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: null,
  });
  expect(config.generation).toEqual({
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: null,
  });
  expect(config.geminiTier).toBe('free');
  expect(missingVariables(config)).toEqual(['GEMINI_API_KEY']);
});

test('GEMINI_API_KEY serves both tasks and nothing is missing', () => {
  const config = loadAiConfig({ GEMINI_API_KEY: SECRET, GEMINI_TIER: 'paid' });
  expect(config.embedding.apiKey).toBe(SECRET);
  expect(config.generation.apiKey).toBe(SECRET);
  expect(config.geminiTier).toBe('paid');
  expect(missingVariables(config)).toEqual([]);
});

test('openai-compatible defaults to OpenAI models and OPENAI_API_KEY / OPENAI_BASE_URL', () => {
  const config = loadAiConfig({
    EMBEDDING_PROVIDER: 'openai-compatible',
    GENERATION_PROVIDER: 'openai-compatible',
    OPENAI_API_KEY: SECRET,
  });
  expect(config.embedding).toEqual({
    provider: 'openai-compatible',
    model: 'text-embedding-3-small',
    dimensions: null,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: SECRET,
  });
  expect(config.generation.model).toBe('gpt-4o-mini');

  const viaShortcut = loadAiConfig({
    EMBEDDING_PROVIDER: 'openai-compatible',
    OPENAI_BASE_URL: 'http://ollama:11434/v1/',
  });
  expect(viaShortcut.embedding.baseUrl).toBe('http://ollama:11434/v1');
});

test('specific variables win over the shortcuts, and each task is configured on its own', () => {
  const config = loadAiConfig({
    EMBEDDING_PROVIDER: 'openai-compatible',
    EMBEDDING_BASE_URL: 'http://localhost:11434/v1',
    EMBEDDING_MODEL: 'nomic-embed-text',
    EMBEDDING_DIMENSIONS: '768',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
    GENERATION_PROVIDER: 'gemini',
    GEMINI_API_KEY: SECRET,
  });
  expect(config.embedding).toEqual({
    provider: 'openai-compatible',
    model: 'nomic-embed-text',
    dimensions: 768,
    baseUrl: 'http://localhost:11434/v1',
    apiKey: null,
  });
  expect(config.generation.provider).toBe('gemini');
  // A local service does not need a key.
  expect(missingVariables(config)).toEqual([]);
});

test('an external openai-compatible service without a key reports the variable to set', () => {
  const config = loadAiConfig({ GENERATION_PROVIDER: 'openai-compatible', GEMINI_API_KEY: SECRET });
  expect(missingVariables(config)).toEqual(['OPENAI_API_KEY']);
});

test('invalid values stop with an error that names the variable', () => {
  expect(() => loadAiConfig({ EMBEDDING_PROVIDER: 'anthropic' })).toThrow(/EMBEDDING_PROVIDER/);
  expect(() => loadAiConfig({ GENERATION_PROVIDER: 'x' })).toThrow(/GENERATION_PROVIDER/);
  expect(() => loadAiConfig({ EMBEDDING_DIMENSIONS: '0' })).toThrow(/EMBEDDING_DIMENSIONS/);
  expect(() => loadAiConfig({ EMBEDDING_DIMENSIONS: '1.5' })).toThrow(/EMBEDDING_DIMENSIONS/);
  expect(() => loadAiConfig({ EMBEDDING_BASE_URL: 'not a url' })).toThrow(/EMBEDDING_BASE_URL/);
  expect(() => loadAiConfig({ GEMINI_TIER: 'gold' })).toThrow(/GEMINI_TIER/);
});

test('privacy is local, free, paid or external, and the public view never contains a key', () => {
  const local = toPublicAiSettings(
    loadAiConfig({
      EMBEDDING_PROVIDER: 'openai-compatible',
      GENERATION_PROVIDER: 'openai-compatible',
      OPENAI_BASE_URL: 'http://host.docker.internal:11434/v1',
      OPENAI_API_KEY: SECRET,
    }),
  );
  expect(local.embedding.privacy).toBe('local');
  expect(local.generation.privacy).toBe('local');

  const mixed = toPublicAiSettings(
    loadAiConfig({ GENERATION_PROVIDER: 'openai-compatible', OPENAI_API_KEY: SECRET, GEMINI_API_KEY: SECRET }),
  );
  expect(mixed.embedding).toEqual({ provider: 'gemini', model: 'gemini-embedding-001', dimensions: 1536, privacy: 'free' });
  expect(mixed.generation).toEqual({ provider: 'openai-compatible', model: 'gpt-4o-mini', privacy: 'external' });
  expect(mixed.missing).toEqual([]);
  expect(JSON.stringify(mixed)).not.toContain(SECRET);

  const paid = toPublicAiSettings(loadAiConfig({ GEMINI_API_KEY: SECRET, GEMINI_TIER: 'paid' }));
  expect(paid.generation.privacy).toBe('paid');
});
