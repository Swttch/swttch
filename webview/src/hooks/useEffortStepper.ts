import { useCallback, useEffect, useRef, useState } from 'react';
import { useEffort } from '@/hooks/useEffort';
import { ULTRACODE_LABEL, buildEffortLevels } from '@/types/effort';

/** How long the last key press waits before the level is written. */
export const EFFORT_STEP_DEBOUNCE_MS = 500;

export interface UseEffortStepperReturn {
  supportsEffort: boolean;
  /** The step to show: the one the user has stepped to, applied or not, else the stored one. */
  index: number;
  /** The label of that step ("Medium", "Ultracode - xhigh + workflows"). */
  label: string;
  /** Moves one step (clamped at both ends) and schedules the write. */
  stepBy: (delta: -1 | 1) => void;
}

/**
 * Steps the effort level from the keyboard.
 *
 * Holding an arrow key fires a press every few dozen milliseconds, and every
 * write goes to the settings file and on to the CLI. So the display moves at
 * once (optimistic) and the write waits until the presses stop for
 * {@link EFFORT_STEP_DEBOUNCE_MS}, then goes out once with the last step.
 *
 * A write that fails drops the optimistic step, and the slider falls back to
 * what is actually stored. Closing the owner before the wait is over still
 * applies the pending step rather than losing it.
 */
export function useEffortStepper(debounceMs: number = EFFORT_STEP_DEBOUNCE_MS): UseEffortStepperReturn {
  const effort = useEffort();
  const { supportsEffort, levels: supported, current, ultracodeAvailable, ultracodeEnabled, setLevel, enableUltracode } = effort;

  const levels = buildEffortLevels(supported);
  const count = levels.length + (ultracodeAvailable ? 1 : 0);
  const ultracodeIndex = ultracodeAvailable ? count - 1 : -1;
  const storedIndex = ultracodeEnabled
    ? ultracodeIndex
    : Math.max(0, levels.findIndex((l) => l.key === current));

  const [pending, setPending] = useState<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Everything the write needs, read at the moment it goes out rather than at the
  // moment the press was scheduled.
  const latest = useRef({ storedIndex, levels, ultracodeIndex, setLevel, enableUltracode });
  latest.current = { storedIndex, levels, ultracodeIndex, setLevel, enableUltracode };

  const flush = useCallback(() => {
    timerRef.current = null;
    const target = pendingRef.current;
    if (target === null) return;
    const { storedIndex: stored, levels: steps, ultracodeIndex: ultra, setLevel: write, enableUltracode: writeUltra } = latest.current;

    const settle = () => {
      if (pendingRef.current !== target) return; // a newer press owns the display now
      pendingRef.current = null;
      if (mountedRef.current) setPending(null);
    };

    if (target === stored) {
      settle();
      return;
    }
    const request = target === ultra
      ? writeUltra()
      : steps[target] ? write(steps[target].key) : Promise.resolve();
    void request.catch(() => undefined).finally(settle);
  }, []);

  const stepBy = useCallback((delta: -1 | 1) => {
    if (!supportsEffort || count <= 1) return;
    const base = pendingRef.current ?? latest.current.storedIndex;
    const next = Math.max(0, Math.min(count - 1, base + delta));
    if (next === base) return;
    pendingRef.current = next;
    setPending(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, debounceMs);
  }, [supportsEffort, count, debounceMs, flush]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Closing within the wait must not drop the choice the user already saw.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        flush();
      }
    };
  }, [flush]);

  const index = pending ?? storedIndex;
  const label = index === ultracodeIndex ? ULTRACODE_LABEL : levels[index]?.label ?? effort.def.label;

  return { supportsEffort, index, label, stepBy };
}
