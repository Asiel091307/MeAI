import { expect, test } from 'vitest';
import { deleteDocument } from '../../src/documents/delete-document';

const documentId = '3f2b8c1e-9a4d-4e7b-8f1a-2c5d6e7f8a9b';
const notFoundReason = 'El documento no existe o ya fue eliminado.';
const errorReason = 'No se pudo eliminar el documento. No se borró nada; inténtalo de nuevo.';

function fakeRepository(behaviour: () => Promise<boolean>) {
  const calls: string[] = [];
  return {
    calls,
    async delete(id: string): Promise<boolean> {
      calls.push(id);
      return behaviour();
    },
  };
}

test('an existing document is reported as deleted', async () => {
  const documents = fakeRepository(async () => true);

  const result = await deleteDocument(documentId, documents);

  expect(result).toEqual({ status: 'deleted' });
  expect(documents.calls).toEqual([documentId]);
});

test('a document that does not exist is reported as not found', async () => {
  const documents = fakeRepository(async () => false);

  const result = await deleteDocument(documentId, documents);

  expect(result).toEqual({ status: 'not_found', reason: notFoundReason });
  expect(documents.calls).toEqual([documentId]);
});

test('a repository failure is reported as error without exposing the internal message', async () => {
  const documents = fakeRepository(async () => {
    throw new Error('password authentication failed for user "meai" at 10.0.0.5');
  });

  const result = await deleteDocument(documentId, documents);

  expect(result).toEqual({ status: 'error', reason: errorReason });
  expect(JSON.stringify(result)).not.toContain('password');
  expect(JSON.stringify(result)).not.toContain('10.0.0.5');
});

test('a document id that is not a UUID is not found and never reaches the repository', async () => {
  const documents = fakeRepository(async () => true);

  const result = await deleteDocument('no-es-un-uuid', documents);

  expect(result).toEqual({ status: 'not_found', reason: notFoundReason });
  expect(documents.calls).toEqual([]);
});
