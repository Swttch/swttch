import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  SideQuestionProvider,
  SideQuestionStatus,
  TOGGLE_SIDE_QUESTION_EVENT,
  useSideQuestions,
} from '../SideQuestionContext';

function wrapperFor(sessionId: string | null) {
  return ({ children }: { children: ReactNode }) => (
    <SideQuestionProvider currentSessionId={sessionId}>{children}</SideQuestionProvider>
  );
}

describe('SideQuestionContext', () => {
  it('records a question as pending and settles it with the answer', () => {
    const { result } = renderHook(() => useSideQuestions(), { wrapper: wrapperFor('s1') });

    act(() => result.current.addQuestion({ requestId: 'r1', sessionId: 's1', question: 'why?' }));
    expect(result.current.exchanges).toHaveLength(1);
    expect(result.current.exchanges[0].status).toBe(SideQuestionStatus.Pending);

    act(() => result.current.settleQuestion('r1', { status: SideQuestionStatus.Answered, answer: 'because' }));
    expect(result.current.exchanges[0]).toMatchObject({
      status: SideQuestionStatus.Answered,
      answer: 'because',
    });
  });

  // The answer travels on the CLI event stream and the send's acknowledgement on
  // its own channel, so they can arrive in either order. Whichever lands second
  // must not undo the first.
  it('keeps the first outcome of a question that is already settled', () => {
    const { result } = renderHook(() => useSideQuestions(), { wrapper: wrapperFor('s1') });
    act(() => result.current.addQuestion({ requestId: 'r1', sessionId: 's1', question: 'why?' }));

    act(() => result.current.settleQuestion('r1', { status: SideQuestionStatus.Answered, answer: 'because' }));
    act(() => result.current.settleQuestion('r1', { status: SideQuestionStatus.Failed }));

    expect(result.current.exchanges[0]).toMatchObject({
      status: SideQuestionStatus.Answered,
      answer: 'because',
    });
  });

  it('fails the questions still waiting for an answer and leaves the answered ones', () => {
    const { result } = renderHook(() => useSideQuestions(), { wrapper: wrapperFor('s1') });
    act(() => {
      result.current.addQuestion({ requestId: 'r1', sessionId: 's1', question: 'answered' });
      result.current.addQuestion({ requestId: 'r2', sessionId: 's1', question: 'waiting' });
      result.current.addQuestion({ requestId: 'r3', sessionId: 's2', question: 'other session' });
    });
    act(() => result.current.settleQuestion('r1', { status: SideQuestionStatus.Answered, answer: 'yes' }));

    act(() => result.current.failPending('s1'));

    expect(result.current.exchanges.map((e) => e.status)).toEqual([
      SideQuestionStatus.Answered,
      SideQuestionStatus.Failed,
    ]);
  });

  it('fails only the waiting questions a CLI already received', () => {
    const { result } = renderHook(() => useSideQuestions(), { wrapper: wrapperFor('s1') });
    act(() => {
      result.current.addQuestion({ requestId: 'r1', sessionId: 's1', question: 'delivered' });
      result.current.addQuestion({ requestId: 'r2', sessionId: 's1', question: 'in flight' });
    });
    act(() => result.current.markDelivered('r1'));

    act(() => result.current.failDelivered('s1'));

    expect(result.current.exchanges.map((e) => e.status)).toEqual([
      SideQuestionStatus.Failed,
      SideQuestionStatus.Pending,
    ]);
  });

  it('shows only the side questions of the session on screen', () => {
    const { result } = renderHook(() => useSideQuestions(), { wrapper: wrapperFor('s1') });
    act(() => {
      result.current.addQuestion({ requestId: 'r1', sessionId: 's1', question: 'mine' });
      result.current.addQuestion({ requestId: 'r2', sessionId: 's2', question: 'other tab' });
    });
    expect(result.current.exchanges.map((e) => e.question)).toEqual(['mine']);
  });

  it('clears only the current session', () => {
    const { result } = renderHook(() => useSideQuestions(), { wrapper: wrapperFor('s1') });
    act(() => {
      result.current.addQuestion({ requestId: 'r1', sessionId: 's1', question: 'mine' });
      result.current.addQuestion({ requestId: 'r2', sessionId: 's2', question: 'other' });
    });
    act(() => result.current.clear());
    expect(result.current.exchanges).toHaveLength(0);
  });

  it('opens and closes on the toggle event the shortcut dispatches', () => {
    const { result } = renderHook(() => useSideQuestions(), { wrapper: wrapperFor('s1') });
    expect(result.current.isOpen).toBe(false);
    act(() => {
      window.dispatchEvent(new CustomEvent(TOGGLE_SIDE_QUESTION_EVENT));
    });
    expect(result.current.isOpen).toBe(true);
    act(() => {
      window.dispatchEvent(new CustomEvent(TOGGLE_SIDE_QUESTION_EVENT));
    });
    expect(result.current.isOpen).toBe(false);
  });

  describe('minimizing', () => {
    it('parks the window without losing the questions', () => {
      const { result } = renderHook(() => useSideQuestions(), { wrapper: wrapperFor('s1') });
      act(() => result.current.addQuestion({ requestId: 'r1', sessionId: 's1', question: 'why?' }));
      act(() => result.current.open());

      act(() => result.current.minimize());

      expect(result.current.isOpen).toBe(false);
      expect(result.current.isMinimized).toBe(true);
      expect(result.current.exchanges).toHaveLength(1);
    });

    it('brings a parked window back when it is opened or toggled again', () => {
      const { result } = renderHook(() => useSideQuestions(), { wrapper: wrapperFor('s1') });
      act(() => result.current.open());
      act(() => result.current.minimize());
      act(() => result.current.open());
      expect(result.current.isOpen).toBe(true);
      expect(result.current.isMinimized).toBe(false);

      act(() => result.current.minimize());
      act(() => {
        window.dispatchEvent(new CustomEvent(TOGGLE_SIDE_QUESTION_EVENT));
      });
      expect(result.current.isOpen).toBe(true);
      expect(result.current.isMinimized).toBe(false);
    });

    it('closes a parked window for good', () => {
      const { result } = renderHook(() => useSideQuestions(), { wrapper: wrapperFor('s1') });
      act(() => result.current.open());
      act(() => result.current.minimize());
      act(() => result.current.close());
      expect(result.current.isOpen).toBe(false);
      expect(result.current.isMinimized).toBe(false);
    });

    it('flags an answer that arrived while parked, and clears the flag when the window comes back', () => {
      const { result } = renderHook(() => useSideQuestions(), { wrapper: wrapperFor('s1') });
      act(() => result.current.addQuestion({ requestId: 'r1', sessionId: 's1', question: 'why?' }));
      act(() => result.current.open());
      act(() => result.current.minimize());

      act(() => result.current.settleQuestion('r1', { status: SideQuestionStatus.Answered, answer: 'because' }));
      expect(result.current.hasUnseen).toBe(true);

      act(() => result.current.open());
      expect(result.current.hasUnseen).toBe(false);
    });

    it('does not flag an answer that arrived while the window was open', () => {
      const { result } = renderHook(() => useSideQuestions(), { wrapper: wrapperFor('s1') });
      act(() => result.current.addQuestion({ requestId: 'r1', sessionId: 's1', question: 'why?' }));
      act(() => result.current.open());

      act(() => result.current.settleQuestion('r1', { status: SideQuestionStatus.Answered, answer: 'because' }));
      expect(result.current.hasUnseen).toBe(false);
    });
  });
});
