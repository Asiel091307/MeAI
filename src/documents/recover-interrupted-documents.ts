import type { DocumentPublicationRepository, RecoveryResult } from '../db/contracts';

export const INTERRUPTED_PROCESSING_REASON =
  'El procesamiento se interrumpió por un reinicio de la aplicación. Vuelve a intentarlo.';

// Runs at startup: attempts left 'processing' by a restart are discarded, never published.
export function recoverInterruptedDocuments(
  publication: Pick<DocumentPublicationRepository, 'recoverInterrupted'>,
): Promise<RecoveryResult> {
  return publication.recoverInterrupted(INTERRUPTED_PROCESSING_REASON);
}
