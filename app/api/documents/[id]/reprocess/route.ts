import type { RouteContextWithId } from '../delete-document-handler';
import { handleDefaultReprocessDocument } from './reprocess-document-handler';

export async function POST(
  request: Request,
  context: RouteContextWithId,
): Promise<Response> {
  return handleDefaultReprocessDocument(request, context);
}
