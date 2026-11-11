import type { DocumentReprocessingRepository } from '../db/contracts';
import {
  processDocument,
  type ProcessDocumentDeps,
  type ProcessDocumentResult,
} from './process-document';

export type ReprocessDocumentDeps = ProcessDocumentDeps & {
  reprocessing: DocumentReprocessingRepository;
};

export type ReprocessDocumentResult =
  | { status: 'not_found' | 'already_processing'; reason: string }
  | ProcessDocumentResult;

const NOT_FOUND_REASON = 'El documento no existe o ya fue eliminado.';
const ALREADY_PROCESSING_REASON = 'El documento ya se está procesando. Espera a que termine.';

// Marks the document 'processing' (so new queries skip it) and rebuilds it as a new version.
// The previous version stays stored until the new one is published, or comes back if it fails.
export async function reprocessDocument(
  documentId: string,
  deps: ReprocessDocumentDeps,
): Promise<ReprocessDocumentResult> {
  const started = await deps.reprocessing.startReprocessing(documentId);
  if (started === 'not_found') {
    return { status: 'not_found', reason: NOT_FOUND_REASON };
  }
  if (started === 'already_processing') {
    return { status: 'already_processing', reason: ALREADY_PROCESSING_REASON };
  }
  return processDocument(documentId, deps);
}
