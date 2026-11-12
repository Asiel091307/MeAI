// Shown when a request gets no answer at all: the server is stopped, Docker is not running,
// or the app is still starting after a restart. Tells the user how to fix it.
export function serverUnreachableMessage(action: string): string {
  return `No se pudo conectar con MeAI ${action}. Comprueba que esté en marcha (docker compose up -d), espera unos segundos y vuelve a intentarlo.`;
}
