import { NextResponse } from 'next/server';
import type { GetDocumentFile } from '../../../../../src/documents/document-file';
import type { RouteContextWithId } from '../delete-document-handler';

const NOT_FOUND_REASON = 'El documento no existe o ya fue eliminado.';
const OPEN_FAILED_REASON = 'No se pudo abrir el archivo del documento. Inténtalo de nuevo.';

// Header-safe fallback: anything outside printable ASCII, plus quotes and backslashes, becomes "_".
function asciiFallback(name: string): string {
  return name.replace(/[^\x20-\x7e]|["\\]/g, '_');
}

// RFC 5987 percent-encoding; encodeURIComponent leaves ' ( ) * unescaped, so escape them too.
function encodeRfc5987(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function contentDispositionFor(name: string): string {
  return `inline; filename="${asciiFallback(name)}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}

export function createGetDocumentFileHandler(getFile: GetDocumentFile) {
  return async function handleGetDocumentFile(
    _request: Request,
    context: RouteContextWithId,
  ): Promise<Response> {
    const resolvedParams = await Promise.resolve(context.params);
    const documentId = resolvedParams?.id ?? '';

    let result;
    try {
      result = await getFile(documentId);
    } catch (error) {
      console.error(`Opening the file of document ${documentId} failed:`, error);
      return NextResponse.json({ error: OPEN_FAILED_REASON }, { status: 500 });
    }

    if (result.status === 'not_found') {
      return NextResponse.json({ error: NOT_FOUND_REASON }, { status: 404 });
    }

    return new Response(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDispositionFor(result.name),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
        'Content-Length': String(result.bytes.byteLength),
      },
    });
  };
}
