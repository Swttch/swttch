import { useCallback, useEffect } from 'react';
import { isMobile } from '@/config/environment';

/**
 * Whether this keystroke is somebody typing, rather than an answer to the
 * panel.
 *
 * Reads the composed path rather than `e.target`, because the review diff's
 * editable side lives in a shadow root: the platform retargets `e.target` to
 * the host element, so a digit typed into a proposed edit looked like a digit
 * pressed at the panel and picked an option instead of reaching the text. The
 * path still holds the real element.
 *
 * `contenteditable` counts for the same reason a textarea does — it is where
 * characters are meant to land.
 */
function isTypingTarget(event: globalThis.KeyboardEvent): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') return true;
    // The attribute as well as the resolved property: jsdom does not implement
    // `isContentEditable`, and the renderer marks its editable side with the
    // attribute either way.
    const attr = node.getAttribute('contenteditable');
    if (attr !== null && attr !== 'false') return true;
    if (node.isContentEditable) return true;
  }
  return false;
}

interface UseApprovalKeyboardParams {
  optionCount: number;
  focusedIndex: number;
  setFocusedIndex: (updater: (prev: number) => number) => void;
  handleOptionClick: (index: number) => void;
  handleTextSubmit: () => void;
  onCancel: () => void;
  /**
   * Collapsed panels keep Escape but drop option keys: the user is reading the
   * conversation behind the panel, and a stray digit must not approve anything.
   */
  selectionDisabled?: boolean;
}

export function useApprovalKeyboard(params: UseApprovalKeyboardParams) {
  const { optionCount, focusedIndex, setFocusedIndex, handleOptionClick, handleTextSubmit, onCancel, selectionDisabled = false } = params;

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isMobile()) {
      e.preventDefault();
      handleTextSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => Math.max(0, prev - 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => Math.min(optionCount, prev + 1));
    }
  }, [optionCount, handleTextSubmit, onCancel, setFocusedIndex]);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      const isInputFocused = isTypingTarget(e);

      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }

      if (selectionDisabled) return;

      if (isInputFocused) return;

      // 숫자 키로 옵션 직접 선택 (1-based)
      const numKey = parseInt(e.key);
      if (!isNaN(numKey) && numKey >= 1 && numKey <= optionCount) {
        e.preventDefault();
        handleOptionClick(numKey - 1);
        return;
      }

      if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIndex(prev => Math.max(0, prev - 1)); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIndex(prev => Math.min(optionCount, prev + 1)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        handleOptionClick(focusedIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [optionCount, focusedIndex, handleOptionClick, onCancel, setFocusedIndex, selectionDisabled]);

  return { handleInputKeyDown };
}
