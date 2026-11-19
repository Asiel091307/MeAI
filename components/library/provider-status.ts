import type { SettingsResponseBody } from '../../app/api/settings/settings-handler';
import type { PrivacyLevel, ProviderKind } from '../../src/rag/providers/ai-config';

// Library footer and notices for the configured AI providers (spec 012, RF-012-2, RF-012-4).
export type ProviderTone = 'ok' | 'warn' | 'error';

export interface ProviderStatus {
  label: string;
  tone: ProviderTone;
  tooltip: string;
  notices: string[];
}

const PROVIDER_NAMES: Record<ProviderKind, string> = {
  gemini: 'Gemini',
  'openai-compatible': 'Compatible OpenAI',
};

const PRIVACY_NOTES: Record<PrivacyLevel, string> = {
  local: 'se procesa en tu equipo y nada sale de él',
  free: 'en el plan gratuito, Google puede usar el texto enviado (fragmentos y preguntas) para mejorar sus productos',
  paid: 'en el plan de pago, Google no usa el texto enviado para mejorar sus productos',
  external: 'el texto enviado (fragmentos y preguntas) sale a un servicio externo y se rige por sus condiciones',
};

export function describeProviderStatus(settings: SettingsResponseBody): ProviderStatus {
  const { embedding, generation, missing, documentsWithOtherModel } = settings;
  const privacies = [embedding.privacy, generation.privacy];
  const tone: ProviderTone =
    missing.length > 0 ? 'error' : privacies.some((p) => p === 'free' || p === 'external') ? 'warn' : 'ok';

  const tooltip = [
    `Embeddings (${PROVIDER_NAMES[embedding.provider]} · ${embedding.model}): ${PRIVACY_NOTES[embedding.privacy]}.`,
    `Respuestas (${PROVIDER_NAMES[generation.provider]} · ${generation.model}): ${PRIVACY_NOTES[generation.privacy]}.`,
    'Los PDF y la base de datos se quedan en tu equipo.',
  ].join(' ');

  const notices: string[] = [];
  if (missing.length > 0) notices.push(`Falta configurar ${missing.join(', ')} en .env.`);
  if (documentsWithOtherModel > 0) {
    notices.push(
      `${documentsWithOtherModel} documentos se indexaron con otro modelo de embeddings. Reprocésalos para poder consultarlos.`,
    );
  }

  return { label: `${PROVIDER_NAMES[generation.provider]} · ${generation.model}`, tone, tooltip, notices };
}
