import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * Fallback timeout (ms) that force-clears the composing flag when an IME
 * abandons a composition without a trailing compositionend/input event.
 */
const FALLBACK_RESET_MS = 100;

/** keyCode reported by browsers while an IME is still processing a keystroke. */
const IME_PROCESS_KEYCODE = 229;

/**
 * inputTypes the browser uses for edits that belong to an in-flight IME
 * composition. An input carrying any other inputType happened outside a
 * composition, which is what lets us detect a composition that ended without
 * announcing itself (see {@link IMEComposition.notifyInput}).
 */
const COMPOSITION_INPUT_TYPES = new Set([
  'insertCompositionText',
  'deleteCompositionText',
  'insertFromComposition',
  'deleteByComposition',
]);

/**
 * The subset of an `InputEvent` the composition tracker needs. Taking a plain
 * object (rather than the DOM event) keeps the decision unit-testable, matching
 * how `shouldSubmitOnEnter` takes its keyboard-event subset.
 */
export interface InputSignal {
  /** `InputEvent.isComposing` — true while the edit is part of a composition. */
  isComposing: boolean;
  /** `InputEvent.inputType` — e.g. `insertText`, `insertCompositionText`. */
  inputType: string;
}

export interface IMEComposition {
  /** Live truth for "an IME composition is in flight" (ref, never state). */
  isComposingRef: RefObject<boolean>;
  /** compositionstart handler: marks composing true synchronously. */
  handleCompositionStart: () => void;
  /** compositionend handler: marks composing false synchronously. */
  handleCompositionEnd: () => void;
  /** keydown hook: keyCode 229 is treated as a composing signal. */
  noteKeyDown: (keyCode: number) => void;
  /**
   * input hook: cancels the pending safety fallback, and lowers the composing
   * flag when the input did not belong to a composition (issue #403).
   */
  notifyInput: (signal: InputSignal) => void;
  /** Query: is a composition currently in flight? */
  isComposing: () => boolean;
}

/**
 * useIMEComposition — the single, ref-only source of truth for IME composition
 * state in the composer.
 *
 * Why this exists: under JCEF (embedded Chromium) `KeyboardEvent.isComposing`
 * is unreliable — it can read false during an active composition and true just
 * after it ends. Relying on it makes a plain Enter in a non-English layout get
 * consumed as a composition "commit", so no newline is produced (issue #215).
 * We therefore track composition ourselves from the composition lifecycle plus
 * the keyCode-229 signal.
 *
 * Why refs, not React state: updating state mid-composition triggers a
 * re-render, and under JCEF that re-render duplicates/stutters the in-progress
 * glyphs. All state here lives in refs so composition never causes a render.
 *
 * Transitions are synchronous (no requestAnimationFrame): during fast Hangul
 * typing a deferred reset would race the next compositionstart and briefly
 * report the wrong state. A short {@link FALLBACK_RESET_MS} timer is the only
 * async piece, and it exists purely as a safety net for IMEs that abandon a
 * composition without a trailing event.
 */
export function useIMEComposition(): IMEComposition {
  const isComposingRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFallback = useCallback(() => {
    if (fallbackTimerRef.current !== null) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const scheduleFallback = useCallback(() => {
    clearFallback();
    fallbackTimerRef.current = setTimeout(() => {
      isComposingRef.current = false;
      fallbackTimerRef.current = null;
    }, FALLBACK_RESET_MS);
  }, [clearFallback]);

  const handleCompositionStart = useCallback(() => {
    // A fresh composition supersedes any pending fallback from a prior one.
    clearFallback();
    isComposingRef.current = true;
  }, [clearFallback]);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    // Safety net: if a keyCode-229 keystroke re-raises the flag right after this
    // without a real composition, the fallback clears it.
    scheduleFallback();
  }, [scheduleFallback]);

  const noteKeyDown = useCallback((keyCode: number) => {
    if (keyCode !== IME_PROCESS_KEYCODE) return;
    // The IME is still processing this keystroke — treat as composing, and arm
    // the fallback so a cancelled composition (no compositionend/input) cannot
    // leave the flag stuck true.
    isComposingRef.current = true;
    scheduleFallback();
  }, [scheduleFallback]);

  const notifyInput = useCallback(
    (signal: InputSignal) => {
      // A committed input means the composition lifecycle is driving state; the
      // safety fallback is no longer needed and must not fire mid-composition.
      clearFallback();

      // Does this edit belong to a composition? The browser answers on the
      // event itself, and the two channels disagree across IMEs: some report
      // `isComposing` reliably, others only distinguish the composition through
      // `inputType`. Either one saying "composition" keeps the flag up.
      const belongsToComposition =
        signal.isComposing || COMPOSITION_INPUT_TYPES.has(signal.inputType);
      if (belongsToComposition) return;

      // The edit happened outside any composition, so no composition is in
      // flight — whatever the flag currently says. This is the only way out for
      // issue #403: Windows Hangul IMEs abandon a composition (Backspace over
      // the in-progress syllable, or a HangulMode layout switch) without ever
      // firing compositionend, which used to leave the flag stuck true and made
      // the composer drop every later keystroke while still painting it.
      isComposingRef.current = false;
    },
    [clearFallback],
  );

  const isComposing = useCallback(() => isComposingRef.current, []);

  useEffect(() => clearFallback, [clearFallback]);

  return {
    isComposingRef,
    handleCompositionStart,
    handleCompositionEnd,
    noteKeyDown,
    notifyInput,
    isComposing,
  };
}
