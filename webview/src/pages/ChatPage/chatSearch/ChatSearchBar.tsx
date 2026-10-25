import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ChevronDownIcon, ChevronUpIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { CHAT_SEARCH_SKIP_ATTRIBUTE } from './collectMatches';
import type { ChatSearch } from './useChatSearch';
import './chatSearch.css';

interface Props {
  search: ChatSearch;
}

const ICON_BUTTON =
  'p-1 rounded text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent transition-colors';

/**
 * The find bar, pinned to the top right of the transcript.
 *
 * Enter goes to the next match and Shift+Enter to the previous one, the way
 * every find box does; Escape closes it and hands focus back to where it was.
 */
export function ChatSearchBar({ search }: Props) {
  const { t } = useTranslation('chat');
  const inputRef = useRef<HTMLInputElement>(null);

  // Each Cmd/Ctrl+F lands in the box with its text selected, so a second press
  // while the bar is already open starts a new search instead of doing nothing.
  useEffect(() => {
    if (!search.isOpen) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [search.isOpen, search.focusNonce]);

  if (!search.isOpen) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) search.previous();
      else search.next();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      search.close();
    }
  };

  const hasQuery = search.query.length > 0;
  const status = !hasQuery
    ? ''
    : search.total > 0
      ? t('chatMessageArea.searchCount', {
          current: search.current + 1,
          // The backend stops counting at its limit; a trailing + says so.
          total: search.truncated ? `${search.total}+` : search.total,
        })
      : search.isLoadingHistory
        ? ''
        : t('chatMessageArea.searchNoResults');

  return (
    // A zero-height strip pinned to the top of the transcript, so the bar starts
    // under whatever banners the chat is showing instead of covering their
    // buttons. It clears the send index on its own: the scroll container already
    // reserves that room. The strip is `sticky` for the same reason the send
    // headers are, which is that it follows the transcript's own top edge.
    <div {...{ [CHAT_SEARCH_SKIP_ATTRIBUTE]: '' }} className="sticky top-0 z-40 h-0">
      <div
        role="search"
        className="absolute top-2 end-3 flex items-center gap-1 px-2 py-1.5 bg-surface-raised border border-border-default rounded-lg shadow-md"
      >
        <input
          ref={inputRef}
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('chatMessageArea.searchPlaceholder')}
          aria-label={t('chatMessageArea.searchPlaceholder')}
          spellCheck={false}
          className="w-44 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary outline-none"
        />
        <span className="min-w-[3.5rem] text-end text-xs text-text-tertiary tabular-nums">
          {search.isLoadingHistory ? (
            <span
              className="inline-block w-3 h-3 align-middle border-2 border-border-default border-t-text-secondary rounded-full animate-spin"
              aria-label={t('chatMessageArea.searchLoadingHistory')}
            />
          ) : (
            status
          )}
        </span>
        <Tooltip content={t('chatMessageArea.searchPrevious')} placement="bottom" inBody>
          <button type="button" className={ICON_BUTTON} disabled={search.total === 0} onClick={search.previous} aria-label={t('chatMessageArea.searchPrevious')}>
            <ChevronUpIcon className="w-4 h-4" />
          </button>
        </Tooltip>
        <Tooltip content={t('chatMessageArea.searchNext')} placement="bottom" inBody>
          <button type="button" className={ICON_BUTTON} disabled={search.total === 0} onClick={search.next} aria-label={t('chatMessageArea.searchNext')}>
            <ChevronDownIcon className="w-4 h-4" />
          </button>
        </Tooltip>
        <Tooltip content={t('chatMessageArea.searchClose')} placement="bottom" inBody>
          <button type="button" className={ICON_BUTTON} onClick={search.close} aria-label={t('chatMessageArea.searchClose')}>
            <XMarkIcon className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
