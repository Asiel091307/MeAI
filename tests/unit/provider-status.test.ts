import { expect, test } from 'vitest';
import { describeProviderStatus } from '../../components/library/provider-status';

// Spec 012, RF-012-2: green for local or paid, amber for free or external, terracotta if missing.
function settings(embeddingPrivacy: string, generationPrivacy: string, missing: string[] = []) {
  return {
    embedding: { provider: 'gemini', model: 'gemini-embedding-001', dimensions: 1536, privacy: embeddingPrivacy },
    generation: { provider: 'gemini', model: 'gemini-3.5-flash-lite', privacy: generationPrivacy },
    missing,
    documentsWithOtherModel: 0,
  } as never;
}

test('the dot tone follows the least private provider and missing configuration', () => {
  expect(describeProviderStatus(settings('local', 'local')).tone).toBe('ok');
  expect(describeProviderStatus(settings('paid', 'local')).tone).toBe('ok');
  expect(describeProviderStatus(settings('local', 'free')).tone).toBe('warn');
  expect(describeProviderStatus(settings('external', 'paid')).tone).toBe('warn');
  expect(describeProviderStatus(settings('local', 'local', ['GEMINI_API_KEY'])).tone).toBe('error');
});

test('the tooltip explains each task in Spanish and there are no notices when all is fine', () => {
  const status = describeProviderStatus(settings('local', 'paid'));
  expect(status.label).toBe('Gemini · gemini-3.5-flash-lite');
  expect(status.tooltip).toContain('Embeddings (Gemini · gemini-embedding-001): se procesa en tu equipo');
  expect(status.tooltip).toContain('Respuestas (Gemini · gemini-3.5-flash-lite): en el plan de pago');
  expect(status.notices).toEqual([]);
});
