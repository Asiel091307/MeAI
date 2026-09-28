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
export type NewDocument = Pick<Document, 'name' | 'pdfBytes'>;

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
}

export type NewChunk = Pick<Chunk, 'page' | 'position' | 'text'>;

export interface DocumentRepository {
  create(input: NewDocument): Promise<Document>;
  findById(id: string): Promise<Document | null>;
  list(): Promise<DocumentMetadata[]>;
  delete(id: string): Promise<void>;
}

export interface DocumentVersionRepository {
  create(documentId: string): Promise<DocumentVersion>;
  setActive(documentId: string, versionId: string): Promise<void>;
}

export interface ChunkRepository {
  save(documentId: string, versionId: string, chunks: readonly NewChunk[]): Promise<void>;
  findByVersion(versionId: string): Promise<Chunk[]>;
}
