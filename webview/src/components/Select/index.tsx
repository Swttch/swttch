import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  /** Placeholder for the filter box, e.g. "Search languages". */
  searchPlaceholder?: string;
  /** Shown in place of the list when the filter matches nothing. */
  noMatchLabel?: string;
}

/**
 * Above this many options, the list gets a filter box.
 *
 * Short lists are faster to scan than to type into, so the box would only be in
 * the way. Long ones (the ~190 spoken languages) cannot be scrolled through
 * usefully at all.
 */
const SEARCHABLE_THRESHOLD = 12;

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
  const {
    value,
    options,
    onChange,
    disabled = false,
    className = '',
    ariaLabel,
    searchPlaceholder,
    noMatchLabel,
  } = props;
  const [isOpen, setIsOpen] = useState(false);
  // The option the keyboard is currently on (highlighted); -1 when none.
  const [activeIndex, setActiveIndex] = useState(-1);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const searchable = options.length > SEARCHABLE_THRESHOLD;

  // Everything below navigates the FILTERED list: with a query applied, the
  // indices the keyboard moves through have to be the ones on screen, or the
  // highlight lands on a row the user cannot see.
  const visibleOptions = useMemo(() => {
    if (!searchable) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query, searchable]);

  // The label on the trigger comes from the full list — a filter that hides the
  // current selection must not blank out what is selected.
  const selected = options.find((option) => option.value === value);
  const selectedIndex = visibleOptions.findIndex((option) => option.value === value);

  const close = useCallback((returnFocus = false) => {
    setIsOpen(false);
    setActiveIndex(-1);
    // Clear the filter too: reopening to a list still narrowed by a forgotten
    // query looks like most of the options have gone missing.
    setQuery('');
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
      const option = visibleOptions[index];
      if (!option) return;
      onChange(option.value);
      close(true);
    },
    [visibleOptions, onChange, close],
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

  /**
   * List navigation, shared by the trigger and the filter box.
   *
   * Which element holds focus depends on whether the list is searchable, so the
   * keys are handled in one place and both callers route into it.
   *
   * @param typing True when the event came from the filter box, where Space is
   *   a character rather than "commit the highlighted option".
   */
  const navigate = (e: React.KeyboardEvent, typing: boolean) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(visibleOptions.length - 1, i + 1));
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
        setActiveIndex(visibleOptions.length - 1);
        break;
      case ' ':
        // In the filter box a space is part of the query ("bosnian sign…"),
        // so only the trigger treats it as commit.
        if (typing) return;
        e.preventDefault();
        commit(activeIndex);
        break;
      case 'Enter':
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

  // Keyboard handling on the trigger, which keeps focus whenever the list has
  // no filter box to take it.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
      return;
    }

    navigate(e, false);
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
          options={visibleOptions}
          value={value}
          activeIndex={activeIndex}
          anchorRef={triggerRef}
          menuRef={menuRef}
          onSelect={(next) => {
            onChange(next);
            close(true);
          }}
          onActivate={setActiveIndex}
          {...(searchable && {
            query,
            searchPlaceholder,
            emptyLabel: noMatchLabel,
            onQueryChange: (next: string) => {
              setQuery(next);
              // The old highlight pointed into the previous result set; leaving
              // it would highlight an unrelated row, or none at all.
              setActiveIndex(0);
            },
            onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => navigate(e, true),
          })}
        />
      )}
    </>
  );
}
