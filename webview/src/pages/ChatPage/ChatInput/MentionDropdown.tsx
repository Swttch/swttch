import { useEffect, useRef } from 'react';
import { MentionResult, MentionItemType } from './hooks/useMention';
import { useTranslation } from '@/i18n';

interface Props {
  results: MentionResult[];
  selectedIndex: number;
  isLoading: boolean;
  onSelect: (index: number) => void;
  onClose: () => void;
}

/**
 * Render `text` with the characters at `matchIndices` (0-based, ascending —
 * as sent by the backend's fuzzy search) wrapped in a bold, accent-colored
 * span, IntelliJ Search-Everywhere style. Consecutive matched characters are
 * grouped into a single span to keep the DOM small. Falls back to plain text
 * when there are no indices (e.g. an empty query).
 */
function renderHighlightedPath(text: string, matchIndices: number[] | undefined) {
  if (!matchIndices || matchIndices.length === 0) {
    return text;
  }

  const matchSet = new Set(matchIndices);
  const segments: Array<{ chars: string; highlighted: boolean }> = [];
  for (let i = 0; i < text.length; i++) {
    const highlighted = matchSet.has(i);
    const last = segments[segments.length - 1];
    if (last && last.highlighted === highlighted) {
      last.chars += text[i];
    } else {
      segments.push({ chars: text[i], highlighted });
    }
  }

  return segments.map((segment, index) =>
    segment.highlighted ? (
      <span key={index} className="text-text-link font-semibold">
        {segment.chars}
      </span>
    ) : (
      <span key={index}>{segment.chars}</span>
    ),
  );
}

export function MentionDropdown(props: Props) {
  const { results, selectedIndex, isLoading, onSelect, onClose } = props;
  const { t } = useTranslation('chat');

  const listRef = useRef<HTMLUListElement>(null);

  // 선택된 항목이 보이도록 스크롤
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement | undefined;
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <div className="w-full bg-surface-overlay border border-border-default rounded-md shadow-lg overflow-hidden">
      {isLoading && results.length === 0 ? (
        <div className="px-3 py-2 text-xs text-text-tertiary">{t('chatInput.mentionDropdown.searching')}</div>
      ) : results.length === 0 ? (
        <div className="px-3 py-2 text-xs text-text-tertiary">{t('chatInput.mentionDropdown.noMatchingFiles')}</div>
      ) : (
        <ul
          ref={listRef}
          className="overflow-y-auto max-h-[200px]"
        >
          {results.map((result, index) => (
            <li key={result.relativePath}>
              <button
                type="button"
                className={`w-full px-3 py-1.5 text-start text-xs flex items-center gap-2 ${
                  index === selectedIndex ? 'bg-surface-selected text-text-primary' : 'text-text-secondary hover:bg-surface-selected/60'
                }`}
                onMouseDown={(e) => {
                  // mousedown에서 처리해야 textarea onBlur보다 먼저 실행됨
                  e.preventDefault();
                  onSelect(index);
                }}
              >
                <span className="flex-shrink-0">
                  {result.type === MentionItemType.Directory ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                    </svg>
                  )}
                </span>
                <span className="truncate">
                  {renderHighlightedPath(result.relativePath, result.matchIndices)}
                  {result.type === MentionItemType.Directory ? '/' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {isLoading && results.length > 0 && (
        <div className="px-3 py-1 text-xs text-text-disabled border-t border-border-default/50">
          {t('chatInput.mentionDropdown.searching')}
        </div>
      )}
      <button
        type="button"
        className="sr-only"
        onClick={onClose}
        aria-label={t('chatInput.mentionDropdown.closeAriaLabel')}
      />
    </div>
  );
}
