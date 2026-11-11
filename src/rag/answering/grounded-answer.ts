import type {
  AnswerEvent,
  AnswerGenerator,
  AnswerSource,
} from '../providers/generation';

export const NO_EVIDENCE_ANSWER =
  'El contexto recuperado no contiene información suficiente para responder a la pregunta.';

export interface StreamGroundedAnswerOptions {
  question: string;
  sources: readonly AnswerSource[];
  generator: AnswerGenerator;
}

export async function* streamGroundedAnswer({
  question,
  sources,
  generator,
}: StreamGroundedAnswerOptions): AsyncIterable<AnswerEvent> {
  if (sources.length === 0) {
    yield { type: 'text', text: NO_EVIDENCE_ANSWER };
    yield { type: 'final', citations: [] };
    return;
  }

  const validSourceIds = new Set(sources.map((s) => s.id));
  let accumulatedText = '';

  for await (const event of generator.stream(question, sources)) {
    if (event.type === 'text') {
      accumulatedText += event.text;
      yield event;
    } else if (event.type === 'final') {
      const isNoEvidence =
        accumulatedText.includes(NO_EVIDENCE_ANSWER) ||
        accumulatedText.toLowerCase().includes('no contiene información suficiente') ||
        accumulatedText.toLowerCase().includes('no hay información suficiente');

      if (isNoEvidence) {
        yield { type: 'final', citations: [] };
      } else {
        const validatedCitations = event.citations.filter((id) => validSourceIds.has(id));
        yield { type: 'final', citations: validatedCitations };
      }
    }
  }
}

