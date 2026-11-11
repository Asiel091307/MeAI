// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { PdfUploader } from '../../../components/pdf-uploader';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('selecting a PDF and submitting sends a POST request to /api/documents with the file', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const mockFetch = vi.fn<typeof fetch>(async (url, init) => {
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

  const onDocumentRegistered = vi.fn();

  render(<PdfUploader fetchFn={mockFetch} onDocumentRegistered={onDocumentRegistered} />);

  const input = screen.getByLabelText(/seleccionar pdf|archivo pdf/i) as HTMLInputElement;
  const pdfFile = new File(['%PDF-1.4 contenido'], 'apuntes.pdf', { type: 'application/pdf' });

  fireEvent.change(input, { target: { files: [pdfFile] } });

  const submitButton = screen.getByRole('button', { name: /subir pdf/i });
  fireEvent.click(submitButton);

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  expect(capturedUrl).toBe('/api/documents');
  expect(capturedInit?.method).toBe('POST');
  expect(capturedInit?.body).toBeInstanceOf(FormData);

  const formData = capturedInit?.body as FormData;
  const uploadedFile = formData.get('file') as File;
  expect(uploadedFile).toBeTruthy();
  expect(uploadedFile.name).toBe('apuntes.pdf');

  await waitFor(() => {
    expect(onDocumentRegistered).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'doc-123',
        name: 'apuntes.pdf',
        status: 'processing',
      }),
    );
  });
});

test('shows the rejection reason in Spanish when the upload returns 400', async () => {
  const mockFetch = vi.fn<typeof fetch>(async () => {
    return new Response(
      JSON.stringify({
        error: 'El archivo supera el tamaño máximo permitido de 10 MB.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  });

  render(<PdfUploader fetchFn={mockFetch} />);

  const input = screen.getByLabelText(/seleccionar pdf|archivo pdf/i) as HTMLInputElement;
  const largeFile = new File(['%PDF-1.4'], 'grande.pdf', { type: 'application/pdf' });

  fireEvent.change(input, { target: { files: [largeFile] } });
  fireEvent.click(screen.getByRole('button', { name: /subir pdf/i }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('El archivo supera el tamaño máximo permitido de 10 MB.');
});
