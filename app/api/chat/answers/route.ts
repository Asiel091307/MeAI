import { handleDefaultPostChatAnswers } from './chat-answers-handler';

export async function POST(request: Request): Promise<Response> {
  return handleDefaultPostChatAnswers(request);
}
