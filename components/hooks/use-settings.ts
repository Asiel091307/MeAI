'use client';

import { useEffect, useState } from 'react';
import type { SettingsResponseBody } from '../../app/api/settings/settings-handler';

// Reads GET /api/settings (spec 012). `refreshKey` changes when the library changes, so the
// "indexed with another model" count follows reprocessing.
export function useSettings(fetchFn: typeof fetch | undefined, refreshKey: string): SettingsResponseBody | null {
  const [settings, setSettings] = useState<SettingsResponseBody | null>(null);

  useEffect(() => {
    let cancelled = false;
    const doFetch = fetchFn ?? globalThis.fetch;
    doFetch('/api/settings')
      .then(async (response) => (response.ok ? await response.json() : null))
      .then((body) => {
        if (!cancelled && isSettings(body)) setSettings(body);
      })
      .catch(() => {
        // The footer simply stays hidden; the library already reports an unreachable server.
      });
    return () => {
      cancelled = true;
    };
  }, [fetchFn, refreshKey]);

  return settings;
}

// Anything that is not a settings body (an old server, an error page) leaves the footer hidden.
function isSettings(body: unknown): body is SettingsResponseBody {
  const value = body as Partial<SettingsResponseBody> | null;
  return (
    typeof value?.embedding?.privacy === 'string' &&
    typeof value.generation?.privacy === 'string' &&
    Array.isArray(value.missing) &&
    typeof value.documentsWithOtherModel === 'number'
  );
}
