import {
  handleDefaultDeleteDocument,
  type NextRouteContextWithId,
} from './delete-document-handler';

export async function DELETE(
  request: Request,
  context: NextRouteContextWithId,
): Promise<Response> {
  return handleDefaultDeleteDocument(request, context);
}
