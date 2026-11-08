import type { NextResponse } from 'next/server';
import {
  handleDefaultGetDocuments,
  type ListDocumentsResponseBody,
} from './list-documents-handler';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<ListDocumentsResponseBody>> {
  return handleDefaultGetDocuments();
}

