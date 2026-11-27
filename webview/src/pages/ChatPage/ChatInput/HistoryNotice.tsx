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
}

const NO_LIVE_TEXT = new LiveText();

/** A line as tall as the "Edited" mark, so the mark's arrival moves nothing. */
const LINE = 'box-content flex h-[calc(1rem+2px)] min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap ps-3 pe-11 pb-1.5';

/**
 * The line over the text of the composer that says where the arrow keys are in the history (#735): ahead of the first
 * step out of the draft, what the next press does, and during the walk, which send is shown and the way back to the
 * draft. The box grows and shrinks around it.
 */
export function HistoryNotice(props: Props) {
  const { t } = useTranslation('chat');
  const open = props.position !== null || props.guarded;
  const liveText = props.liveText ?? NO_LIVE_TEXT;
  const live = useSyncExternalStore(liveText.subscribe, liveText.get);

  // The line closes with the words it had: it would otherwise empty first and shrink after.
  const shownRef = useRef<Props | null>(null);
  if (open) shownRef.current = props;
  const shown = shownRef.current;
  const modified = open && live !== null && props.isModifiedWith ? props.isModifiedWith(live) : shown?.modified;

  return (
    <div
      aria-hidden={!open}
      className={`grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out motion-reduce:transition-none ${
        open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        <div role="status" className={`${LINE} select-none text-xs text-text-tertiary tabular-nums`}>
          {shown && !shown.position && (
            <span className="truncate">{t(shown.hasDraft ? 'chatInput.history.guardKeepsDraft' : 'chatInput.history.guard')}</span>
          )}
          {shown?.position && (
            <>
              <span className="shrink-0">{t('chatInput.history.position', shown.position)}</span>
              {modified && (
                <span className="shrink-0 rounded border border-border-default px-1 text-[0.6875rem] leading-4 text-text-secondary">
                  {t('chatInput.history.modified')}
                </span>
              )}
              {shown.hasDraft && (
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
