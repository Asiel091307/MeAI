import type { AnswerSource } from '../providers/generation';

export interface ResolvedCitation {
  chunkId: string;
  documentId: string;
  documentName?: string;
  page: number;
  text: string;
  // Similarity with which the fragment was retrieved, shown on its evidence card (spec 004).
  score: number;
  available: boolean;
}

export interface CitedStatement {
  statement: string;
  citationIds: readonly string[];
}

export interface ValidatedStatement {
  statement: string;
  valid: boolean;
  citations: ResolvedCitation[];
  rejectedCitationIds: string[];
}

export function resolveCitations(
  citationIds: readonly string[],
  sources: readonly AnswerSource[],
  documentNames?: ReadonlyMap<string, string>,
): ResolvedCitation[] {
  const sourceById = new Map<string, AnswerSource>();
  for (const source of sources) {
    sourceById.set(source.id, source);
  }

  const seen = new Set<string>();
  const resolved: ResolvedCitation[] = [];

  for (const rawId of citationIds) {
    const id = rawId.trim();
    if (!id || seen.has(id)) {
      continue;
    }

    const source = sourceById.get(id);
    if (!source) {
      continue;
    }

    seen.add(id);
    const documentName = documentNames?.get(source.documentId);
    resolved.push({
      chunkId: source.id,
      documentId: source.documentId,
      ...(documentName !== undefined ? { documentName } : {}),
      page: source.page,
      text: source.text,
      score: source.score,
      available: true,
    });
  }

  return resolved;
}

export function validateStatementCitations(
  statements: readonly CitedStatement[],
  sources: readonly AnswerSource[],
  documentNames?: ReadonlyMap<string, string>,
): ValidatedStatement[] {
  const validSourceIds = new Set(sources.map((s) => s.id));

  return statements.map((item) => {
    const citations = resolveCitations(item.citationIds, sources, documentNames);
    const rejectedCitationIds = item.citationIds
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && !validSourceIds.has(id));

    return {
      statement: item.statement,
      valid: citations.length > 0,
      citations,
      rejectedCitationIds,
    };
  });
}

// Parses inline statement citations such as "Afirmación [chunk-1]." into structured statements.
export function parseInlineCitedStatements(text: string): CitedStatement[] {
  const inlinePattern = /([^\n[\]]+?)\s*\[(?:FUENTES|CITAS|cita)?\s*:?\s*([^\]]+)\]/gi;
  const statements: CitedStatement[] = [];
  let match: RegExpExecArray | null;

  while ((match = inlinePattern.exec(text)) !== null) {
    const statement = match[1].trim();
    const citationIds = match[2]
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    statements.push({ statement, citationIds });
  }

  return statements;
}
