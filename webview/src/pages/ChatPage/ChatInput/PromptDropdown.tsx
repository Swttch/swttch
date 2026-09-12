import { useEffect, useRef } from 'react';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import type { ScopedPrompt } from '@/types/prompt';
import type { PromptRow } from './hooks/usePromptLibrary';

interface Props {
  rows: PromptRow[];
  selectedIndex: number;
  isLoading: boolean;
  /** True once a load has resolved, so "no prompts yet" is only shown when true. */
  hasLoaded: boolean;
  onSelect: (index: number) => void;
  /** Open this prompt's edit screen in the library, without leaving the composer. */
  onEdit: (prompt: ScopedPrompt) => void;
  /** Remove this prompt, after asking. */
  onDelete: (prompt: ScopedPrompt) => void;
  onClose: () => void;
}

/** A one-line preview of the prompt's text, for the row under its name. */
const PREVIEW_MAX_LENGTH = 80;

function preview(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  return oneLine.length > PREVIEW_MAX_LENGTH
    ? `${oneLine.slice(0, PREVIEW_MAX_LENGTH)}…`
    : oneLine;
}

/**
 * The prompt library panel, opened by `!!` in the composer.
 *
 * The chrome deliberately matches {@link MentionDropdown} — the sibling that
 * shares this slot — rather than inventing its own height cap and scroll
 * behaviour. Two panels opening in the same place at different sizes reads as a
 * defect on its own (issue #314).
 */
export function PromptDropdown(props: Props) {
  const { rows, selectedIndex, isLoading, hasLoaded, onSelect, onEdit, onDelete, onClose } = props;
  const { t } = useTranslation('chat');
  // The category wording belongs to the library, and must read the same here.
  const { t: tCommon } = useTranslation('common');

  const listRef = useRef<HTMLUListElement>(null);

  // Keep the selected row visible once the list scrolls.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement | undefined;
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const promptRowCount = rows.filter(row => row.kind === 'prompt').length;

  return (
    <div className="w-full bg-surface-overlay border border-border-default rounded-md shadow-lg overflow-hidden">
      {isLoading && promptRowCount === 0 ? (
        <div className="px-3 py-2 text-xs text-text-tertiary">
          {t('chatInput.promptDropdown.loading')}
        </div>
      ) : (
        <>
          {hasLoaded && promptRowCount === 0 && (
            <div className="px-3 py-2 text-xs text-text-tertiary">
              {t('chatInput.promptDropdown.noPrompts')}
            </div>
          )}
          <ul ref={listRef} className="overflow-y-auto max-h-[200px]">
            {rows.map((row, index) => (
              <li
                key={
                  row.kind === 'prompt'
                    ? row.prompt.id
                    : row.kind === 'heading'
                      ? `heading:${row.category ?? ''}`
                      : 'create'
                }
              >
                {/* A heading is drawn, not offered: the arrows step over it and
                    it has nothing to paste. */}
                {row.kind === 'heading' ? (
                  <span className="block px-3 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                    {row.category ?? tCommon('promptLibrary.uncategorised')}
                  </span>
                ) : (
                <button
                  type="button"
                  className={`group/row flex w-full items-center gap-2 px-3 py-1.5 text-start text-xs ${
                    index === selectedIndex
                      ? 'bg-surface-selected text-text-primary'
                      : 'text-text-secondary hover:bg-surface-selected/60'
                  }`}
                  onMouseDown={(e) => {
                    // mousedown, not click: the composer's blur must not fire first.
                    e.preventDefault();
                    onSelect(index);
                  }}
                >
                  {row.kind === 'create' ? (
                    <>
                      <span className="flex-shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </span>
                      <span className="truncate">{t('chatInput.promptDropdown.createPrompt')}</span>
                    </>
                  ) : (
                    <>
                      <span className="flex-shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                      </span>
                      {/* The name gets a quarter of the row and the content gets
                          the rest. The name is only there to tell the prompts
                          apart at a glance; the content is the thing the user is
                          about to paste, so it is the one that needs the room.
                          (They used to split the row evenly.)

                          The name also carries the hierarchy by WEIGHT, so the
                          preview and scope beside it can stay readable instead
                          of being dimmed into the background. They were on
                          `text-disabled` (82/255 in dark), the dimmest token we
                          have, and could not be read at a glance. */}
                      <span className="truncate w-1/4 flex-shrink-0 font-medium">{row.prompt.name}</span>
                      {/* Hovering the preview shows the whole prompt, line
                          breaks and all: one truncated line cannot tell the user
                          what they are about to paste. */}
                      <Tooltip content={row.prompt.content}>
                        <span className="truncate text-text-tertiary flex-1 hidden sm:inline">
                          {preview(row.prompt.content)}
                        </span>
                      </Tooltip>
                      {/* The scope label and the two actions share one slot:
                          the label says where the prompt lives, which matters
                          while reading the list, and the actions matter only
                          once the pointer has settled on a row. Swapping them
                          keeps the row one line wide either way. */}
                      <span className="relative flex-shrink-0 text-text-tertiary">
                        <span className="group-hover/row:invisible">
                          {row.prompt.scope === 'project'
                            ? t('chatInput.promptDropdown.scopeProject')
                            : t('chatInput.promptDropdown.scopeGlobal')}
                        </span>
                        <span className="absolute inset-y-0 end-0 hidden items-center gap-0.5 group-hover/row:flex">
                          {/* Rendered as spans: this sits inside the row's own
                              <button>, and a button may not contain a button. */}
                          <span
                            role="button"
                            tabIndex={-1}
                            title={t('chatInput.promptDropdown.editPrompt')}
                            aria-label={t('chatInput.promptDropdown.editPrompt')}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onEdit(row.prompt);
                            }}
                            className="rounded p-0.5 text-text-tertiary transition-colors hover:text-text-primary"
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5" />
                          </span>
                          <span
                            role="button"
                            tabIndex={-1}
                            title={t('chatInput.promptDropdown.deletePrompt')}
                            aria-label={t('chatInput.promptDropdown.deletePrompt')}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onDelete(row.prompt);
                            }}
                            className="rounded p-0.5 text-text-tertiary transition-colors hover:text-state-error-fg"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </span>
                        </span>
                      </span>
                    </>
                  )}
                </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <button
        type="button"
        className="sr-only"
        onClick={onClose}
        aria-label={t('chatInput.promptDropdown.closeAriaLabel')}
      />
    </div>
  );
}
