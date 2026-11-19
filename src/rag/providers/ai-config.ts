// AI provider configuration from the environment (spec 012). Embeddings and generation are
// configured separately, so they can come from different providers.

export type ProviderKind = 'gemini' | 'openai-compatible';
export type GeminiTier = 'free' | 'paid';
export type PrivacyLevel = 'local' | 'free' | 'paid' | 'external';

export interface GenerationSettings {
  provider: ProviderKind;
  model: string;
  baseUrl: string;
  apiKey: string | null;
}

export interface EmbeddingSettings extends GenerationSettings {
  // null = the model's native size (openai-compatible); Gemini always asks for a size.
  dimensions: number | null;
}

export interface AiConfig {
  embedding: EmbeddingSettings;
  generation: GenerationSettings;
  geminiTier: GeminiTier;
}

// What the browser may see: never an API key.
export interface PublicAiSettings {
  embedding: { provider: ProviderKind; model: string; dimensions: number | null; privacy: PrivacyLevel };
  generation: { provider: ProviderKind; model: string; privacy: PrivacyLevel };
  missing: string[];
}

type Env = Readonly<Record<string, string | undefined>>;

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULTS = {
  gemini: { embeddingModel: 'gemini-embedding-001', generationModel: 'gemini-3.5-flash-lite', dimensions: 1536 },
  'openai-compatible': { embeddingModel: 'text-embedding-3-small', generationModel: 'gpt-4o-mini', dimensions: null },
} as const;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal', 'ollama']);

const read = (env: Env, name: string): string | undefined => env[name]?.trim() || undefined;

function readProvider(env: Env, name: string): ProviderKind {
  const value = read(env, name) ?? 'gemini';
  if (value !== 'gemini' && value !== 'openai-compatible') {
    throw new Error(`${name} must be "gemini" or "openai-compatible"; received "${value}".`);
  }
  return value;
}

function readBaseUrl(env: Env, name: string, provider: ProviderKind): string {
  const shortcut = provider === 'openai-compatible' ? read(env, 'OPENAI_BASE_URL') : undefined;
  const value = read(env, name) ?? shortcut ?? (provider === 'gemini' ? GEMINI_BASE_URL : OPENAI_BASE_URL);
  const source = read(env, name) ? name : shortcut ? 'OPENAI_BASE_URL' : name;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
  } catch {
    throw new Error(`${source} must be an http(s) URL; received "${value}".`);
  }
  return value.replace(/\/+$/, '');
}

function readApiKey(env: Env, name: string, provider: ProviderKind): string | null {
  return read(env, name) ?? read(env, provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY') ?? null;
}

function readDimensions(env: Env, provider: ProviderKind): number | null {
  const raw = read(env, 'EMBEDDING_DIMENSIONS');
  if (!raw) return DEFAULTS[provider].dimensions;
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    throw new Error(`EMBEDDING_DIMENSIONS must be a positive integer; received "${raw}".`);
  }
  return Number(raw);
}

function readTier(env: Env): GeminiTier {
  const value = read(env, 'GEMINI_TIER') ?? 'free';
  if (value !== 'free' && value !== 'paid') {
    throw new Error(`GEMINI_TIER must be "free" or "paid"; received "${value}".`);
  }
  return value;
}

export function loadAiConfig(env: Env = process.env): AiConfig {
  const embeddingProvider = readProvider(env, 'EMBEDDING_PROVIDER');
  const generationProvider = readProvider(env, 'GENERATION_PROVIDER');
  return {
    embedding: {
      provider: embeddingProvider,
      model: read(env, 'EMBEDDING_MODEL') ?? DEFAULTS[embeddingProvider].embeddingModel,
      dimensions: readDimensions(env, embeddingProvider),
      baseUrl: readBaseUrl(env, 'EMBEDDING_BASE_URL', embeddingProvider),
      apiKey: readApiKey(env, 'EMBEDDING_API_KEY', embeddingProvider),
    },
    generation: {
      provider: generationProvider,
      model: read(env, 'GENERATION_MODEL') ?? DEFAULTS[generationProvider].generationModel,
      baseUrl: readBaseUrl(env, 'GENERATION_BASE_URL', generationProvider),
      apiKey: readApiKey(env, 'GENERATION_API_KEY', generationProvider),
    },
    geminiTier: readTier(env),
  };
}

export function privacyOf(settings: GenerationSettings, tier: GeminiTier): PrivacyLevel {
  if (settings.provider === 'gemini') return tier;
  return LOCAL_HOSTS.has(new URL(settings.baseUrl).hostname) ? 'local' : 'external';
}

// Keys that must be set before the provider can work. Local services need none.
export function missingVariables(config: AiConfig): string[] {
  const missing = new Set<string>();
  for (const settings of [config.embedding, config.generation]) {
    if (settings.apiKey) continue;
    if (settings.provider === 'gemini') missing.add('GEMINI_API_KEY');
    else if (privacyOf(settings, config.geminiTier) !== 'local') missing.add('OPENAI_API_KEY');
  }
  return [...missing];
}

export function toPublicAiSettings(config: AiConfig): PublicAiSettings {
  return {
    embedding: {
      provider: config.embedding.provider,
      model: config.embedding.model,
      dimensions: config.embedding.dimensions,
      privacy: privacyOf(config.embedding, config.geminiTier),
    },
    generation: {
      provider: config.generation.provider,
      model: config.generation.model,
      privacy: privacyOf(config.generation, config.geminiTier),
    },
    missing: missingVariables(config),
  };
}
