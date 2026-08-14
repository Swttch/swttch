import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { Portal } from '../Portal';
import type { SelectOption } from './types';

/** Stable id for the active option, wired to the listbox's aria-activedescendant. */
const OPTION_ID_PREFIX = 'select-option-';

interface Position {
  left: number;
  top: number;
  minWidth: number;
}

interface Props {
  options: SelectOption[];
  value: string;
  /** Index of the keyboard-highlighted option (-1 = none). */
  activeIndex: number;
  anchorRef: RefObject<HTMLElement>;
  menuRef: RefObject<HTMLDivElement>;
  onSelect: (value: string) => void;
  /** Sync the active index to the option under the pointer (hover). */
  onActivate: (index: number) => void;
  /** Current filter text. Absent when this list is not searchable. */
  query?: string;
  onQueryChange?: (query: string) => void;
  searchPlaceholder?: string;
  /** Shown when the filter matches nothing. */
  emptyLabel?: string;
  /**
   * Keys pressed in the filter box. Focus sits there while searching, so the
   * list navigation keys have to be routed back to the owner rather than left
   * on the trigger, which no longer has focus.
   */
  onSearchKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Floating option list for {@link Select}.
 *
 * Rendered through {@link Portal} into `document.body` with `position: fixed`,
 * anchored to the trigger via `getBoundingClientRect`. Unlike a native
 * `<select>` popup — which the OS draws as a separate window and which JCEF
 * windowed (non-OSR) mode mis-positions (issue #96) — this list is plain DOM
 * inside the web view, so its coordinates always track the trigger.
 *
 * The only inline style is the runtime-computed `left`/`top`/`minWidth`, which
 * cannot be expressed as build-time Tailwind classes. All visual styling stays
 * in className.
 */
export function SelectMenu(props: Props) {
  const {
    options,
    value,
    activeIndex,
    anchorRef,
    menuRef,
    onSelect,
    onActivate,
    query,
    onQueryChange,
    searchPlaceholder,
    emptyLabel,
    onSearchKeyDown,
  } = props;
  const [pos, setPos] = useState<Position | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const gap = 4;
    const viewportPadding = 8;
    const menu = menuRef.current;
    // On mobile <html> carries CSS `zoom` (x1.25). getBoundingClientRect() and
    // window.innerHeight report visual px (zoom already applied), but this menu
    // is painted through a Portal into <body>, still inside that zoom context —
    // so a raw fixed `top` would be multiplied by zoom AGAIN and the menu would
    // drift down (issue: detached below the trigger). Compute the placement in
    // visual px (promoting the unzoomed offsetWidth/Height by zoom), then divide
    // the final fixed offsets by zoom to cancel the context scaling. zoom is 1
    // on desktop, making this a no-op there.
    const zoom = parseFloat(document.documentElement.style.zoom) || 1;
    const menuHeight = (menu?.offsetHeight ?? 0) * zoom;
    // Right-align the menu to the trigger: when the list is wider than the
    // trigger it grows leftward, keeping its right edge flush with the trigger.
    const menuWidth = Math.max((menu?.offsetWidth ?? 0) * zoom, rect.width);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + gap && rect.top > spaceBelow;

    const leftVisual = Math.max(viewportPadding, rect.right - menuWidth);
    const topVisual = openUp ? rect.top - menuHeight - gap : rect.bottom + gap;
    setPos({
      left: leftVisual / zoom,
      top: topVisual / zoom,
      minWidth: rect.width / zoom,
    });
  }, [anchorRef, menuRef, options]);

  // Keep the keyboard-highlighted option in view as Arrow keys move it.
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = menuRef.current?.querySelector(`#${OPTION_ID_PREFIX}${activeIndex}`) as HTMLElement | null;
    // scrollIntoView is unimplemented in jsdom; guard so tests don't throw.
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, menuRef]);

  return (
    <Portal>
      <div
        ref={menuRef}
        role="listbox"
        aria-activedescendant={activeIndex >= 0 ? `${OPTION_ID_PREFIX}${activeIndex}` : undefined}
        className="fixed z-[100] max-h-72 overflow-y-auto rounded-lg border border-border-default bg-surface-raised py-1 shadow-xl"
        style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, minWidth: pos?.minWidth ?? 0 }}
      >
        {onQueryChange && (
          // Sticky so it survives scrolling a long list, and stopPropagation on
          // keys so typing here never reaches the trigger's Arrow/Enter handling
          // — otherwise a space in the query would commit an option.
          <div className="sticky top-0 z-10 bg-surface-raised px-2 pb-1">
            <input
              type="text"
              autoFocus
              value={query ?? ''}
              placeholder={searchPlaceholder}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onSearchKeyDown}
              className="w-full rounded border border-border-default bg-surface-overlay px-2 py-1 text-sm text-text-primary placeholder-text-tertiary"
            />
          </div>
        )}

        {options.length === 0 && (
          <p className="px-3 py-2 text-sm text-text-tertiary">{emptyLabel}</p>
        )}

        {options.map((option, index) => {
          const isSelected = option.value === value;
          const isActive = index === activeIndex;
          return (
            <button
              key={option.value}
              id={`${OPTION_ID_PREFIX}${index}`}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(option.value)}
              onMouseEnter={() => onActivate(index)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-sm transition-colors ${
                isActive ? 'bg-surface-hover' : ''
              } ${isSelected ? 'text-text-primary' : 'text-text-secondary'} ${
                option.italic ? 'italic text-text-tertiary' : ''
              }`}
            >
              <span className="truncate">{option.label}</span>
              {isSelected && (
                <span aria-hidden className="flex-shrink-0 text-accent-primary">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Portal>
  );
}
