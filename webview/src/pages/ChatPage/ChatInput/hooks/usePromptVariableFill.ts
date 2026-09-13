import { useCallback, useRef, useState } from 'react';
import { parsePromptVariables, fillPromptVariables } from '@/utils/promptVariables';

/** A prompt waiting for its `{{...}}` placeholders to be answered. */
export interface PendingVariableFill {
  /** The saved prompt's text, still holding its placeholders. */
  content: string;
  /** The names to ask for, de-duplicated and in first-appearance order. */
  names: string[];
}

export interface UsePromptVariableFillReturn {
  /** The prompt being asked about, or null when nothing is pending. */
  pending: PendingVariableFill | null;
  /**
   * Hand a prompt over for insertion.
   *
   * When it holds no placeholders this calls [onFilled] straight away, so the
   * common case never sees a dialog. Otherwise the answers are collected first
   * and [onFilled] runs with the filled text.
   */
  requestFill: (content: string, onFilled: (filled: string) => void) => void;
  /** Answer the pending prompt and insert it. */
  submit: (values: Record<string, string>) => void;
  /** Drop the pending prompt without inserting anything. */
  cancel: () => void;
}

interface PendingWithCallback extends PendingVariableFill {
  onFilled: (filled: string) => void;
}

/**
 * The one gate every prompt insertion passes through.
 *
 * A saved prompt reaches the composer by two routes — the `!!` panel replaces
 * the token the user typed, and the library modal appends to the end — and both
 * must stop for placeholders. Keeping the decision here rather than in either
 * route is what stops one of them from quietly skipping it.
 */
export function usePromptVariableFill(): UsePromptVariableFillReturn {
  // The callback lives in a ref rather than in state: the insert is a side
  // effect, and running it from a state updater would fire it twice under
  // StrictMode. The ref also makes "claim it once" a plain read-and-clear, so a
  // held Enter or a double click cannot insert the same prompt twice.
  const pendingRef = useRef<PendingWithCallback | null>(null);
  const [pending, setPending] = useState<PendingVariableFill | null>(null);

  const requestFill = useCallback(
    (content: string, onFilled: (filled: string) => void) => {
      const names = parsePromptVariables(content);
      if (names.length === 0) {
        onFilled(content);
        return;
      }
      pendingRef.current = { content, names, onFilled };
      setPending({ content, names });
    },
    [],
  );

  const submit = useCallback((values: Record<string, string>) => {
    const claimed = pendingRef.current;
    if (!claimed) return;
    pendingRef.current = null;
    setPending(null);
    claimed.onFilled(fillPromptVariables(claimed.content, values));
  }, []);

  const cancel = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
  }, []);

  return { pending, requestFill, submit, cancel };
}
