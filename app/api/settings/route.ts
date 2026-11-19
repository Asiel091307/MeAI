import { handleDefaultGetSettings } from './settings-handler';

export const dynamic = 'force-dynamic';

// GET /api/settings: active AI providers, their privacy and what is missing (spec 012).
export async function GET() {
  return handleDefaultGetSettings();
}
