export type DocumentStatus = 'processing' | 'available' | 'failed';
export type VersionStatus = 'processing' | 'complete' | 'failed';

export interface Document {
  id: string;
  name: string;
  pdfBytes: Uint8Array;
  status: DocumentStatus;
  error: string | null;
  activeVersionId: string | null;
  createdAt: Date;
}

export type DocumentMetadata = Omit<Document, 'pdfBytes'>;
export type NewDocument = Pick<Document, 'name' | 'pdfBytes'> &
  Partial<Pick<Document, 'status' | 'error'>>;

export interface DocumentVersion {
  id: string;
  documentId: string;
  status: VersionStatus;
  createdAt: Date;
}

export interface Chunk {
  id: string;
  documentId: string;
  versionId: string;
  page: number;
  position: number;
  text: string;
  embedding: readonly number[];
}

export type NewChunk = Pick<Chunk, 'page' | 'position' | 'text' | 'embedding'>;

export interface DocumentRepository {
  create(input: NewDocument): Promise<Document>;
  findById(id: string): Promise<Document | null>;
  list(): Promise<DocumentMetadata[]>;
  delete(id: string): Promise<boolean>;
}

export interface DocumentVersionRepository {
  // Starts a processing attempt: a new version with status 'processing', not active yet.
  create(documentId: string): Promise<DocumentVersion>;
}

export interface ChunkRepository {
  // Saves the chunks of a version that is not published yet: nobody can query them until publish.
  save(documentId: string, versionId: string, chunks: readonly NewChunk[]): Promise<void>;
  findByVersion(versionId: string): Promise<Chunk[]>;
}

export interface RecoveryResult {
  // Documents with no previous version, now 'failed'.
  failed: string[];
  // Documents whose previous complete version is available again.
  restored: string[];
}

export type StartReprocessingResult = 'started' | 'not_found' | 'already_processing';

// T59: reprocessing starts by marking the document 'processing', which removes it from new
// queries even if it keeps an active version. publish / fail then finish the attempt.
export interface DocumentReprocessingRepository {
  startReprocessing(documentId: string): Promise<StartReprocessingResult>;
}

// Moves a processing attempt to its final state. Each method is one transaction.
export interface DocumentPublicationRepository {
  // T30: the version becomes 'complete' and the only active one; the document becomes 'available'.
  publish(documentId: string, versionId: string): Promise<void>;
  // T31: discards the attempt and its chunks. Without a previous active version the document
  // becomes 'failed' with the reason; with one, that version stays active ('available').
  fail(documentId: string, versionId: string, reason: string): Promise<void>;
  // T32: applies fail() to every attempt left 'processing' by an interrupted run.
  recoverInterrupted(reason: string): Promise<RecoveryResult>;
}
