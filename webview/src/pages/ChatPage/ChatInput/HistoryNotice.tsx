import { useRef, useSyncExternalStore } from 'react';
import { Trans, useTranslation } from '@/i18n';
import { LiveText } from './draft/liveText';

interface Props {
  /** The send shown, counted from the oldest, or null while the box holds the draft. */
  position: { index: number; total: number } | null;
  /** The send shown was changed after it was recalled. */
  modified: boolean;
  /** The next Up leaves the draft for the history. */
  guarded: boolean;
  /** Something is written in the draft, which the walk keeps. */
  hasDraft: boolean;
  /** The text on screen while an IME composes it, ahead of what `modified` was worked out from. */
  liveText?: LiveText;
  /** Whether the send shown reads as changed with that text. */
  isModifiedWith?: (text: string) => boolean;
  /** How many sends other than the one shown have an edit kept. */
  otherEdits?: number;
  /** Open the history modal, from the mark that counts the edits. */
  onOpenHistory?: () => void;
}

const NO_LIVE_TEXT = new LiveText();

/** A line as tall as the "Edited" mark, so the mark's arrival moves nothing. */
const LINE = 'box-content flex h-[calc(1rem+2px)] min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap ps-3 pe-11 pb-1.5';

/**
 * The line over the text of the composer that says where the arrow keys are in the history (#735): ahead of the first
 * step out of the draft, what the next press does, and during the walk, which send is shown and the way back to the
 * draft. While any send has an edit kept, a mark counts the edits and opens the history, from the draft too. The box
 * grows and shrinks around the line.
 */
export function HistoryNotice(props: Props) {
  const { t } = useTranslation('chat');
  const liveText = props.liveText ?? NO_LIVE_TEXT;
  const live = useSyncExternalStore(liveText.subscribe, liveText.get);
  const modifiedNow = props.position !== null && live !== null && props.isModifiedWith ? props.isModifiedWith(live) : props.position !== null && props.modified;
  const edits = (props.otherEdits ?? 0) + (modifiedNow ? 1 : 0);
  const open = props.position !== null || props.guarded || edits > 0;

  // The line closes with the words it had: it would otherwise empty first and shrink after.
  const shownRef = useRef<(Props & { edits: number }) | null>(null);
  if (open) shownRef.current = { ...props, modified: modifiedNow, edits };
  const shown = shownRef.current;

  return (
    <div
      aria-hidden={!open}
      className={`grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out motion-reduce:transition-none ${
        open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        <div role="status" className={`${LINE} select-none text-xs text-text-tertiary tabular-nums`}>
          {shown?.position && <span className="shrink-0">{t('chatInput.history.position', shown.position)}</span>}
          {/* One place in the line for every state, so a press on it lands although the words around it change. */}
          {shown && shown.edits > 0 && (
            <button
              type="button"
              onClick={shown.onOpenHistory}
              className={`inline-flex shrink-0 items-center gap-1 rounded border border-border-default ps-1 pe-0.5 text-[0.6875rem] leading-4 transition-colors hover:bg-surface-hover ${
                shown.modified ? 'text-text-primary' : 'text-text-tertiary'
              }`}
            >
              {t(shown.modified ? 'chatInput.history.modified' : 'chatInput.history.edits')}
              <span
                className={`inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent-claude px-[3px] text-[0.625rem] font-semibold leading-none text-white ${
                  shown.modified ? '' : 'opacity-70'
                }`}
              >
                {shown.edits}
              </span>
            </button>
          )}
          {shown && !shown.position && shown.guarded && (
            <span className="truncate">{t(shown.hasDraft ? 'chatInput.history.guardKeepsDraft' : 'chatInput.history.guard')}</span>
          )}
          {shown?.position && shown.hasDraft && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden">
                <Trans
                  t={t}
                  i18nKey="chatInput.history.restoreDraft"
                  components={{
                    kbd: <kbd className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded border border-border-default px-0.5 font-sans" />,
                  }}
                />
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
