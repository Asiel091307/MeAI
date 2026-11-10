// Next.js runs register() once when the server starts.
// Next also compiles this file for the Edge runtime, which has no `fs` or `net`, so the
// Node-only work lives in instrumentation-node.ts and is imported inside this check:
// that way the Edge bundle never tries to include `pg`.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { recoverInterruptedDocumentsAtStartup } = await import('./instrumentation-node');
    await recoverInterruptedDocumentsAtStartup();
  }
}
