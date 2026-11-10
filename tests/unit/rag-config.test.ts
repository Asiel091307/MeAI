import { expect, test } from 'vitest';
import { DEFAULT_RAG_CONFIG, loadRagConfig } from '../../src/rag/config';

test('the default RAG parameters are explicit: 1000-character chunks, 200 of overlap, 5 results', () => {
  expect(DEFAULT_RAG_CONFIG).toEqual({ chunkSize: 1000, chunkOverlap: 200, retrievalTopK: 5 });
  expect(loadRagConfig({})).toEqual(DEFAULT_RAG_CONFIG);
});

test('every RAG parameter can be changed through environment variables', () => {
  expect(loadRagConfig({ CHUNK_SIZE: '500', CHUNK_OVERLAP: '50', RETRIEVAL_TOP_K: '8' })).toEqual({
    chunkSize: 500,
    chunkOverlap: 50,
    retrievalTopK: 8,
  });
});

test('an empty variable keeps its default value', () => {
  expect(loadRagConfig({ CHUNK_SIZE: '', CHUNK_OVERLAP: '  ', RETRIEVAL_TOP_K: '' })).toEqual(
    DEFAULT_RAG_CONFIG,
  );
});

test('invalid values fail fast and name the variable', () => {
  expect(() => loadRagConfig({ CHUNK_SIZE: 'mil' })).toThrow(/CHUNK_SIZE/);
  expect(() => loadRagConfig({ CHUNK_SIZE: '0' })).toThrow(/CHUNK_SIZE/);
  expect(() => loadRagConfig({ CHUNK_OVERLAP: '-1' })).toThrow(/CHUNK_OVERLAP/);
  expect(() => loadRagConfig({ CHUNK_OVERLAP: '1.5' })).toThrow(/CHUNK_OVERLAP/);
  expect(() => loadRagConfig({ RETRIEVAL_TOP_K: '0' })).toThrow(/RETRIEVAL_TOP_K/);
});

test('the overlap must be smaller than the chunk size', () => {
  expect(() => loadRagConfig({ CHUNK_SIZE: '300', CHUNK_OVERLAP: '300' })).toThrow(/CHUNK_OVERLAP/);
  expect(() => loadRagConfig({ CHUNK_SIZE: '100' })).toThrow(/CHUNK_OVERLAP/);
});
