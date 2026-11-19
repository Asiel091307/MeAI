import { NextResponse } from 'next/server';
import { getPool } from '../../../src/db/pool';
import { countDocumentsWithOtherModel } from '../../../src/db/postgres-embedding-status';
import { type AiConfig, loadAiConfig, type PublicAiSettings, toPublicAiSettings } from '../../../src/rag/providers/ai-config';

// What GET /api/settings returns (spec 012, RF-012-2): never an API key.
export interface SettingsResponseBody extends PublicAiSettings {
  documentsWithOtherModel: number;
}

export interface SettingsHandlerDeps {
  loadConfig: () => AiConfig;
  countDocumentsWithOtherModel: (model: string, dimensions: number | null) => Promise<number>;
}

export function createGetSettingsHandler(deps: SettingsHandlerDeps) {
  return async (): Promise<NextResponse<SettingsResponseBody | { error: string }>> => {
    let config: AiConfig;
    try {
      config = deps.loadConfig();
    } catch (error) {
      // An invalid value names the variable (never a key), so the message can be shown as is.
      return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
    const settings = toPublicAiSettings(config);
    let documentsWithOtherModel = 0;
    try {
      documentsWithOtherModel = await deps.countDocumentsWithOtherModel(
        settings.embedding.model,
        settings.embedding.dimensions,
      );
    } catch (error) {
      // The provider settings are still worth showing; the library already reports the database.
      console.error('Could not count documents indexed with another embedding model:', error);
    }
    return NextResponse.json({ ...settings, documentsWithOtherModel });
  };
}

export function handleDefaultGetSettings() {
  return createGetSettingsHandler({
    loadConfig: () => loadAiConfig(),
    countDocumentsWithOtherModel: (model, dimensions) =>
      countDocumentsWithOtherModel(getPool(), model, dimensions),
  })();
}
