// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AppShell } from '../../../components/app-shell';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function emptyListResponse(): Response {
  return new Response(JSON.stringify({ documents: [], message: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('selecting a PDF sends a POST request to /api/documents with the file and lists the new document', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const mockFetch = vi.fn<typeof fetch>(async (url, init) => {
    if (init?.method !== 'POST') {
      return emptyListResponse();
    }
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        document: {
          id: 'doc-123',
          name: 'apuntes.pdf',
          status: 'processing',
          error: null,
          activeVersionId: null,
          createdAt: '2026-11-10T12:00:00.000Z',
        },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
  });

  render(<AppShell fetchFn={mockFetch} pollIntervalMs={0} />);

  const input = screen.getByLabelText('Subir documentos') as HTMLInputElement;
  expect(input.multiple).toBe(true);
  const pdfFile = new File(['%PDF-1.4 contenido'], 'apuntes.pdf', { type: 'application/pdf' });

  fireEvent.change(input, { target: { files: [pdfFile] } });

  await waitFor(() => {
    expect(capturedUrl).toBe('/api/documents');
  });
  expect(capturedInit?.method).toBe('POST');
  expect(capturedInit?.body).toBeInstanceOf(FormData);

  const formData = capturedInit?.body as FormData;
  const uploadedFile = formData.get('file') as File;
  expect(uploadedFile).toBeTruthy();
  expect(uploadedFile.name).toBe('apuntes.pdf');

  // The registered document appears in the library as processing
  expect(await screen.findByRole('article', { name: 'apuntes.pdf' })).toBeTruthy();
  expect(screen.getByLabelText('Estado de apuntes.pdf').textContent).toBe('En procesamiento');
});

test('shows the rejection reason in Spanish, with the file name, when the upload returns 400', async () => {
  const mockFetch = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== 'POST') {
      return emptyListResponse();
    }
    return new Response(
      JSON.stringify({
        error: 'El archivo supera el tamaño máximo permitido de 10 MB.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  });

  render(<AppShell fetchFn={mockFetch} pollIntervalMs={0} />);

  const input = screen.getByLabelText('Subir documentos') as HTMLInputElement;
  const largeFile = new File(['%PDF-1.4'], 'grande.pdf', { type: 'application/pdf' });

  fireEvent.change(input, { target: { files: [largeFile] } });

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('grande.pdf: El archivo supera el tamaño máximo permitido de 10 MB.');
  expect(screen.queryByRole('article', { name: 'grande.pdf' })).toBeNull();
});
