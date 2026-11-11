import {
  handleDefaultDeleteDocument,
  type RouteContextWithId,
} from './delete-document-handler';

export async function DELETE(
  request: Request,
  context: RouteContextWithId,
): Promise<Response> {
  return handleDefaultDeleteDocument(request, context);
}
