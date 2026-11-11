export type QuestionPhase = 'idle' | 'searching' | 'generating';

export const CONCURRENT_QUESTION_REASON =
  'Ya hay una pregunta en curso. Espera a que finalice la respuesta antes de enviar otra.';

export type BeginQuestionAttemptResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export interface ActiveQuestionGuard {
  getPhase(): QuestionPhase;
  isBusy(): boolean;
  beginSearching(): BeginQuestionAttemptResult;
  enterGenerating(): void;
  finish(): void;
  runExclusive<T>(
    operation: (controls: { enterGenerating: () => void }) => Promise<T>,
  ): Promise<T>;
}

export function createActiveQuestionGuard(): ActiveQuestionGuard {
  let phase: QuestionPhase = 'idle';

  return {
    getPhase() {
      return phase;
    },
    isBusy() {
      return phase !== 'idle';
    },
    beginSearching(): BeginQuestionAttemptResult {
      if (phase !== 'idle') {
        return { allowed: false, reason: CONCURRENT_QUESTION_REASON };
      }
      phase = 'searching';
      return { allowed: true };
    },
    enterGenerating() {
      if (phase === 'searching') {
        phase = 'generating';
      }
    },
    finish() {
      phase = 'idle';
    },
    async runExclusive<T>(
      operation: (controls: { enterGenerating: () => void }) => Promise<T>,
    ): Promise<T> {
      const attempt = this.beginSearching();
      if (!attempt.allowed) {
        throw new Error(attempt.reason);
      }

      try {
        return await operation({
          enterGenerating: () => this.enterGenerating(),
        });
      } finally {
        this.finish();
      }
    },
  };
}
