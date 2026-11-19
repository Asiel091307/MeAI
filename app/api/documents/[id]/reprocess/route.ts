import type { NextRouteContextWithId } from '../delete-document-handler';
import { handleDefaultReprocessDocument } from './reprocess-document-handler';

export async function POST(
  request: Request,
  context: NextRouteContextWithId,
): Promise<Response> {
  return handleDefaultReprocessDocument(request, context);
}
