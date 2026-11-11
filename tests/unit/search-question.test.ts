import { describe, expect, it, vi } from 'vitest';
import type { DocumentMetadata } from '../../src/db/contracts';
import { searchQuestion } from '../../src/rag/retrieval/search-question';
import type { RetrievedChunk } from '../../src/rag/retrieval/contracts';

const SEARCH_FAILED_REASON =
  'No se pudo completar la búsqueda en tus documentos. Inténtalo de nuevo.';

const chunks: RetrievedChunk[] = [
  { chunkId: 'c1', documentId: 'd1', page: 2, text: 'Texto uno', score: 0.9 },
  { chunkId: 'c2', documentId: 'd1', page: 3, text: 'Texto dos', score: 0.7 },
];

function document(status: DocumentMetadata['status']): DocumentMetadata {
  return { id: 'd1', name: 'a.pdf', status } as DocumentMetadata;
}

function setup(options: { statuses?: DocumentMetadata['status'][] } = {}) {
  const statuses = options.statuses ?? ['available'];
  const list = vi.fn(async () => statuses.map(document));
  const embed = vi.fn(async (_text: string) => [0.1, 0.2, 0.3] as readonly number[]);
  const searchSimilar = vi.fn(async (_vector: readonly number[], _topK: number) => chunks);
  return {
    list,
    embed,
    searchSimilar,
    deps: {
      documents: { list },
      embeddings: { embed },
      search: { searchSimilar },
      topK: 4,
    },
  };
}

describe('searchQuestion', () => {
  it('returns the found chunks and passes topK through', async () => {
    const { deps, embed, searchSimilar } = setup();

    const result = await searchQuestion('¿Qué dice?', deps);

    expect(result).toEqual({ ok: true, chunks });
    expect(embed).toHaveBeenCalledWith('¿Qué dice?');
    expect(searchSimilar).toHaveBeenCalledWith([0.1, 0.2, 0.3], 4);
  });

  it('rejects an invalid question without embedding or searching', async () => {
    const { deps, embed, searchSimilar } = setup();

    const result = await searchQuestion('   ', deps);

    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(embed).not.toHaveBeenCalled();
    expect(searchSimilar).not.toHaveBeenCalled();
  });

  it('stops when no document is available without embedding or searching', async () => {
    const { deps, embed, searchSimilar } = setup({ statuses: ['processing', 'failed'] });

    const result = await searchQuestion('¿Qué dice?', deps);

    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(embed).not.toHaveBeenCalled();
    expect(searchSimilar).not.toHaveBeenCalled();
  });

  it('returns a retryable failure when the search throws and never runs the next step', async () => {
    const { deps, searchSimilar } = setup();
    searchSimilar.mockRejectedValueOnce(new Error('connection refused to db:5432'));
    const generate = vi.fn();

    const result = await searchQuestion('¿Qué dice?', deps);
    if (result.ok) generate(result.chunks);

    expect(result).toEqual({ ok: false, retryable: true, reason: SEARCH_FAILED_REASON });
    expect(JSON.stringify(result)).not.toContain('5432');
    expect(generate).not.toHaveBeenCalled();
  });

  it('returns a retryable failure when the embedding throws', async () => {
    const { deps, embed, searchSimilar } = setup();
    embed.mockRejectedValueOnce(new Error('api key invalid'));

    const result = await searchQuestion('¿Qué dice?', deps);

    expect(result).toEqual({ ok: false, retryable: true, reason: SEARCH_FAILED_REASON });
    expect(searchSimilar).not.toHaveBeenCalled();
  });

  it('succeeds when the same question is retried after a failure', async () => {
    const { deps, searchSimilar } = setup();
    searchSimilar.mockRejectedValueOnce(new Error('boom'));

    const first = await searchQuestion('¿Qué dice?', deps);
    const second = await searchQuestion('¿Qué dice?', deps);

    expect(first).toMatchObject({ ok: false, retryable: true });
    expect(second).toEqual({ ok: true, chunks });
  });
});
