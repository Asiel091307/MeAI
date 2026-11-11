import { expect, test } from 'vitest';
import {
  CONCURRENT_QUESTION_REASON,
  createActiveQuestionGuard,
} from '../../src/rag/answering/active-question-guard';

test('rejects a second question during searching and generating phases and allows it after completion', () => {
  const guard = createActiveQuestionGuard();
  expect(guard.getPhase()).toBe('idle');

  // Begin first question (searching phase)
  const firstAttempt = guard.beginSearching();
  expect(firstAttempt).toEqual({ allowed: true });
  expect(guard.getPhase()).toBe('searching');

  // Second question during searching phase is rejected
  const duringSearchAttempt = guard.beginSearching();
  expect(duringSearchAttempt).toEqual({
    allowed: false,
    reason: CONCURRENT_QUESTION_REASON,
  });

  // Transition first question to generating phase
  guard.enterGenerating();
  expect(guard.getPhase()).toBe('generating');

  // Second question during generating phase is also rejected
  const duringGenAttempt = guard.beginSearching();
  expect(duringGenAttempt).toEqual({
    allowed: false,
    reason: CONCURRENT_QUESTION_REASON,
  });

  // Finish first question
  guard.finish();
  expect(guard.getPhase()).toBe('idle');

  // Now a new question is allowed
  const afterFinishAttempt = guard.beginSearching();
  expect(afterFinishAttempt).toEqual({ allowed: true });
  guard.finish();
});

test('releases the lock and allows retrying after a failed search or generation', async () => {
  const guard = createActiveQuestionGuard();

  await expect(
    guard.runExclusive(async ({ enterGenerating }) => {
      expect(guard.getPhase()).toBe('searching');
      // Concurrent attempt inside runExclusive is rejected
      expect(guard.beginSearching()).toEqual({
        allowed: false,
        reason: CONCURRENT_QUESTION_REASON,
      });

      enterGenerating();
      expect(guard.getPhase()).toBe('generating');
      throw new Error('Fallo simulado en generación');
    }),
  ).rejects.toThrow('Fallo simulado en generación');

  // Guard returns to idle after failure so the user can retry
  expect(guard.getPhase()).toBe('idle');
  expect(guard.beginSearching()).toEqual({ allowed: true });
  guard.finish();
});
