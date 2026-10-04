import { useEffect, useRef } from 'react';
import { focusManager } from '@/api/focus/FocusManager';

/** Runs `callback` each time this window goes from unfocused to focused. */
export function useOnWindowFocus(callback: () => void): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let wasFocused = focusManager.isFocused();
    return focusManager.subscribe((focused) => {
      const regained = focused && !wasFocused;
      wasFocused = focused;
      if (regained) callbackRef.current();
    });
  }, []);
}
