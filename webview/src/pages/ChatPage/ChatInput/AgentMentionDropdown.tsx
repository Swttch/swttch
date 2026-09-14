import { useEffect, useRef } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { rowLabel, type ActiveSessionRow } from './hooks/useAgentMention';

interface Props {
  rows: ActiveSessionRow[];
  selectedIndex: number;
  /** No cached list yet, so the list area has nothing to show but a notice. */
  isPending: boolean;
  /** A read is in flight, first or silent. Drives the header spinner. */
  isFetching: boolean;
  /** Read the list again now. */
  onRefresh: () => void;
  onSelect: (index: number) => void;
  onClose: () => void;
}

/**
 * Split a session name into the part every row repeats and the part that tells
 * two rows apart.
 *
 * The CLI names a session after its working directory plus a short suffix, so
 * sessions in one project share everything but the last segment:
 * `claude-code-gui-jetbrains-b1` and `claude-code-gui-jetbrains-76` differ in
 * two characters out of twenty-eight.
 *
 * Nothing is hidden or shortened — the name is the address, and an address the
 * user cannot read in full is worse than a wide row. Only the weight differs.
 */
function splitName(name: string): { prefix: string; suffix: string } {
  const lastDash = name.lastIndexOf('-');
  if (lastDash <= 0) return { prefix: '', suffix: name };
  return { prefix: name.slice(0, lastDash), suffix: name.slice(lastDash) };
}

/**
 * The active-session panel, opened by `@@` in the composer.
 *
 * The chrome matches {@link MentionDropdown} and {@link PromptDropdown}, the
 * siblings that share this slot, rather than inventing its own width, height cap
 * and scroll behaviour (issue #314).
 *
 * The one thing the siblings do not have is the header, and it earns its place:
 * this list is the only one of the three that goes stale on its own. Sessions
 * start and end while the composer sits open, so the panel needs somewhere to
 * say "still reading" and somewhere to be told "read it again". That makes this
 * panel taller than its siblings by the height of one header row, which is a
 * deliberate exception to the rule above rather than a drift.
 */
export function AgentMentionDropdown(props: Props) {
  const { rows, selectedIndex, isPending, isFetching, onRefresh, onSelect, onClose } = props;
  const { t } = useTranslation('chat');

  const listRef = useRef<HTMLUListElement>(null);

  // Keep the arrow-key selection on screen.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div className="w-full bg-surface-overlay border border-border-default rounded-md shadow-lg overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border-subtle">
        <span className="text-xs text-text-tertiary">
          {t('chatInput.agentMentionDropdown.title')}
        </span>
        {/*
          mousedown, not click: the composer still holds focus while this panel
          is open, and a click would let the composer's blur close the panel
          before the handler ever ran, so the button would appear dead. This is
          the same reason the rows below commit on mousedown.
        */}
        <button
          type="button"
          className="text-text-tertiary hover:text-text-primary transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            onRefresh();
          }}
          aria-label={t('chatInput.agentMentionDropdown.refresh')}
          title={t('chatInput.agentMentionDropdown.refresh')}
          tabIndex={-1}
        >
          <ArrowPathIcon className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isPending ? (
        <div className="px-3 py-2 text-xs text-text-tertiary">
          {t('chatInput.agentMentionDropdown.loading')}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-2 text-xs text-text-tertiary">
          {t('chatInput.agentMentionDropdown.noOtherSessions')}
        </div>
      ) : (
        <ul ref={listRef} className="overflow-y-auto max-h-[200px]">
          {rows.map((row, index) => {
            const { prefix, suffix } = splitName(row.agent.name);
            return (
              <li key={row.agent.sessionId}>
                <button
                  type="button"
                  className={`w-full px-3 py-1.5 text-start text-xs flex items-center gap-2 ${
                    index === selectedIndex
                      ? 'bg-surface-selected text-text-primary'
                      : 'text-text-secondary hover:bg-surface-selected/60'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(index);
                  }}
                  title={row.agent.name}
                >
                  {/*
                    min-w-0 is load-bearing: without it this flex item refuses to
                    shrink below its text width and pushes the name off the row,
                    which is the one thing the name must never do.
                  */}
                  <span className="flex-1 min-w-0 truncate">{rowLabel(row)}</span>
                  <span className="shrink-0 whitespace-nowrap">
                    {prefix && <span className="text-text-tertiary/50">{prefix}</span>}
                    <span className="text-text-tertiary">{suffix}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className="sr-only"
        onClick={onClose}
        aria-label={t('chatInput.agentMentionDropdown.closeAriaLabel')}
      />
    </div>
  );
}
