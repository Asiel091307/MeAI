import { expect, test } from 'vitest';
import { createGetSettingsHandler } from '../../app/api/settings/settings-handler';
import { loadAiConfig } from '../../src/rag/providers/ai-config';

// Spec 012, RF-012-2: provider, model, privacy, missing variables and mismatched documents, no keys.
const SECRET = 'AIza-settings-secret-42';

test('returns the public settings and the documents indexed with another model, without keys', async () => {
  const counted: unknown[] = [];
  const handler = createGetSettingsHandler({
    loadConfig: () => loadAiConfig({ GEMINI_API_KEY: SECRET, GENERATION_PROVIDER: 'openai-compatible', OPENAI_API_KEY: SECRET }),
    countDocumentsWithOtherModel: async (model, dimensions) => {
      counted.push([model, dimensions]);
      return 2;
    },
  });
  const response = await handler();
  const text = await response.text();
  expect(response.status).toBe(200);
  expect(text).not.toContain(SECRET);
  expect(JSON.parse(text)).toEqual({
    embedding: { provider: 'gemini', model: 'gemini-embedding-001', dimensions: 1536, privacy: 'free' },
    generation: { provider: 'openai-compatible', model: 'gpt-4o-mini', privacy: 'external' },
    missing: [],
    documentsWithOtherModel: 2,
  });
  expect(counted).toEqual([['gemini-embedding-001', 1536]]);
});

test('reports the missing key', async () => {
  const handler = createGetSettingsHandler({
    loadConfig: () => loadAiConfig({}),
    countDocumentsWithOtherModel: async () => 0,
  });
  expect((await (await handler()).json()).missing).toEqual(['GEMINI_API_KEY']);
});

test('an invalid value answers 500 with the variable name', async () => {
  const handler = createGetSettingsHandler({
    loadConfig: () => loadAiConfig({ EMBEDDING_PROVIDER: 'anthropic' }),
    countDocumentsWithOtherModel: async () => 0,
  });
  const response = await handler();
  expect(response.status).toBe(500);
  expect((await response.json()).error).toMatch(/EMBEDDING_PROVIDER/);
});

test('a database failure still returns the provider settings', async () => {
  const handler = createGetSettingsHandler({
    loadConfig: () => loadAiConfig({ GEMINI_API_KEY: SECRET }),
    countDocumentsWithOtherModel: async () => {
      throw new Error('password authentication failed');
    },
  });
  const response = await handler();
  expect(response.status).toBe(200);
  expect((await response.json()).documentsWithOtherModel).toBe(0);
});
