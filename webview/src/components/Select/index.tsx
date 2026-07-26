import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { SelectMenu } from './SelectMenu';
import type { SelectOption } from './types';

export * from './types';

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Styling for the trigger button (background, border, padding, text color). */
  className?: string;
  ariaLabel?: string;
}

/**
 * Custom dropdown that replaces the native `<select>`.
 *
 * Native `<select>` popups are drawn by the OS as a separate window, which
 * JCEF windowed (non-OSR) rendering positions incorrectly — the list shows up
 * detached from the trigger while the hitbox stays in place (issue #96). This
 * component renders its option list as plain DOM, so it never detaches.
 *
 * Fully keyboard-operable, like a native select: the trigger opens on
 * Enter/Space/ArrowUp/ArrowDown; once open, Arrow keys move the active option,
 * Home/End jump to the ends, Enter/Space commit it, and Escape/Tab close and
 * return focus to the trigger.
 */
export function Select(props: Props) {
  const { value, options, onChange, disabled = false, className = '', ariaLabel } = props;
  const [isOpen, setIsOpen] = useState(false);
  // The option the keyboard is currently on (highlighted); -1 when none.
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback((returnFocus = false) => {
    setIsOpen(false);
    setActiveIndex(-1);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Open with the active option seeded to the current selection (or the first),
  // so the first ArrowUp/Down moves relative to a sensible starting point.
  const open = useCallback(() => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  }, [selectedIndex]);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) return;
      onChange(option.value);
      close(true);
    },
    [options, onChange, close],
  );

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    // Escape closes from anywhere (not just when the trigger holds focus), so a
    // stray focus state can't wedge the list open. Arrow/Enter navigation lives
    // on the trigger's own handler (below), which keeps focus while open.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, close]);

  // Keyboard handling lives on the trigger (which keeps focus while the list is
  // open), so it composes with the popover's own key handling without a global
  // document listener fighting other components.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        // Let focus move on, but close the list so it doesn't linger detached.
        close();
        break;
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          if (isOpen) close();
          else open();
        }}
        onKeyDown={handleKeyDown}
        className={`inline-flex items-center justify-between gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          selected?.italic ? 'italic' : ''
        } ${className}`}
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <ChevronDownIcon
          className={`h-4 w-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <SelectMenu
          options={options}
          value={value}
          activeIndex={activeIndex}
          anchorRef={triggerRef}
          menuRef={menuRef}
          onSelect={(next) => {
            onChange(next);
            close(true);
          }}
          onActivate={setActiveIndex}
        />
      )}
    </>
  );
}
