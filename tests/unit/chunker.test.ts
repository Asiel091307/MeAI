import { describe, expect, test } from 'vitest';
import { chunkPages } from '../../src/rag/ingestion/chunker';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'; // 26 characters, no spaces: chunk edges are exact

describe('chunkPages size and overlap', () => {
  test('changing chunkSize changes the number and content of chunks', () => {
    const pages = [{ page: 1, text: ALPHABET }];

    const small = chunkPages('doc-1', pages, { chunkSize: 5, overlap: 0 });
    const large = chunkPages('doc-1', pages, { chunkSize: 13, overlap: 0 });

    expect(small.map((chunk) => chunk.text)).toEqual([
      'abcde',
      'fghij',
      'klmno',
      'pqrst',
      'uvwxy',
      'z',
    ]);
    expect(large.map((chunk) => chunk.text)).toEqual(['abcdefghijklm', 'nopqrstuvwxyz']);
  });

  test('changing overlap changes the content; consecutive chunks share exactly overlap characters', () => {
    const pages = [{ page: 1, text: ALPHABET }];

    const withoutOverlap = chunkPages('doc-1', pages, { chunkSize: 10, overlap: 0 });
    const withOverlap = chunkPages('doc-1', pages, { chunkSize: 10, overlap: 3 });

    expect(withoutOverlap.map((chunk) => chunk.text)).toEqual([
      'abcdefghij',
      'klmnopqrst',
      'uvwxyz',
    ]);
    expect(withOverlap.map((chunk) => chunk.text)).toEqual([
      'abcdefghij',
      'hijklmnopq',
      'opqrstuvwx',
      'vwxyz',
    ]);

    for (let index = 1; index < withOverlap.length; index += 1) {
      const previous = withOverlap[index - 1].text;
      const current = withOverlap[index].text;
      expect(previous.slice(-3)).toBe(current.slice(0, 3));
    }
  });

  test('a chunk with overlap 0 never repeats text from the previous chunk', () => {
    const chunks = chunkPages('doc-1', [{ page: 1, text: ALPHABET }], { chunkSize: 10, overlap: 0 });

    expect(chunks.map((chunk) => chunk.text).join('')).toBe(ALPHABET);
  });
});

describe('chunkPages origin metadata', () => {
  test('every chunk keeps the document id and its page', () => {
    const chunks = chunkPages(
      'doc-42',
      [
        { page: 1, text: ALPHABET },
        { page: 3, text: 'hola mundo' },
      ],
      { chunkSize: 10, overlap: 2 },
    );

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.documentId).toBe('doc-42');
      expect([1, 3]).toContain(chunk.page);
    }
  });

  test('positions start at 1 on each page and increase by 1', () => {
    const chunks = chunkPages(
      'doc-1',
      [
        { page: 1, text: ALPHABET },
        { page: 2, text: ALPHABET },
      ],
      { chunkSize: 10, overlap: 0 },
    );

    const page1 = chunks.filter((chunk) => chunk.page === 1).map((chunk) => chunk.position);
    const page2 = chunks.filter((chunk) => chunk.page === 2).map((chunk) => chunk.position);

    expect(page1).toEqual([1, 2, 3]);
    expect(page2).toEqual([1, 2, 3]);
  });

  test('no chunk mixes text from two pages', () => {
    const chunks = chunkPages(
      'doc-1',
      [
        { page: 1, text: 'aaaaaaaaaaaaaaaaaaaa' },
        { page: 2, text: 'bbbbbbbbbbbbbbbbbbbb' },
      ],
      { chunkSize: 7, overlap: 2 },
    );

    for (const chunk of chunks) {
      const expectedLetter = chunk.page === 1 ? 'a' : 'b';
      expect(chunk.text).toMatch(new RegExp(`^${expectedLetter}+$`));
    }
  });

  test('chunk text is trimmed and never blank', () => {
    const chunks = chunkPages(
      'doc-1',
      [{ page: 1, text: 'hola   mundo.   Esto es una prueba   de fragmentos.   ' }],
      { chunkSize: 8, overlap: 2 },
    );

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text).not.toBe('');
      expect(chunk.text.trim()).toBe(chunk.text);
    }
  });
});

describe('chunkPages blank content', () => {
  test('blank pages produce no chunks', () => {
    const chunks = chunkPages(
      'doc-1',
      [
        { page: 1, text: '   \n\t  ' },
        { page: 2, text: '' },
        { page: 3, text: 'contenido real' },
      ],
      { chunkSize: 50, overlap: 0 },
    );

    expect(chunks).toEqual([
      { documentId: 'doc-1', page: 3, position: 1, text: 'contenido real' },
    ]);
  });

  test('no pages returns an empty list', () => {
    expect(chunkPages('doc-1', [], { chunkSize: 10, overlap: 0 })).toEqual([]);
  });
});

describe('chunkPages option validation', () => {
  const pages = [{ page: 1, text: ALPHABET }];

  test.each([
    ['chunkSize 0', { chunkSize: 0, overlap: 0 }],
    ['negative chunkSize', { chunkSize: -5, overlap: 0 }],
    ['non-integer chunkSize', { chunkSize: 2.5, overlap: 0 }],
    ['negative overlap', { chunkSize: 10, overlap: -1 }],
    ['overlap equal to chunkSize', { chunkSize: 10, overlap: 10 }],
    ['overlap greater than chunkSize', { chunkSize: 10, overlap: 11 }],
    ['non-integer overlap', { chunkSize: 10, overlap: 1.5 }],
  ])('throws for %s', (_label, options) => {
    expect(() => chunkPages('doc-1', pages, options)).toThrow(Error);
  });
});
