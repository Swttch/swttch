import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRightIcon, PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Portal } from '@/components/Portal';
import { Tooltip } from '@/components/Tooltip';
import { useEscapeLayer } from '@/hooks/useEscapeLayer';
import type { ComposerContent } from '@/shared';
import type { SendIndexEntry } from '../sendList';

interface Props {
  /** Every send of the session, oldest first: the list the send index and the arrow keys walk. */
  entries: SendIndexEntry[];
  /** The edits kept, by send key. */
  edits: Record<string, ComposerContent>;
  /** The send the composer shows, or null while it shows the draft. */
  currentKey: string | null;
  /** A send as it was sent; undefined when it cannot be read. */
  loadContent: (key: string) => Promise<ComposerContent | undefined>;
  /** The bytes of a picture, base64. */
  pictureOf: (id: string) => string | undefined;
  /** Put a send in the composer. */
  onRecall: (key: string) => void;
  /** Give up the edit of a send. */
  onRevert: (key: string) => void;
  onClose: () => void;
}

/**
 * The history of the composer in one list (#735): every send of the session in the order sent, folded to a line each
 * that unfolds in place. A send with an edit kept carries a dot, starts open, and shows the edit. From here one puts a
 * send in the composer, or gives up its edit.
 */
export function HistoryModal(props: Props) {
  const { entries, edits, currentKey, onClose } = props;
  const { t } = useTranslation('chat');
  const { t: tc } = useTranslation('common');
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const [opened, setOpened] = useState(() => new Set(entries.filter((e) => edits[e.key] !== undefined).map((e) => e.key)));
  const toggle = (key: string) =>
    setOpened((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // Open on what the mark was about: the edited send in the composer, or the newest edited one.
  const [firstInView] = useState(() => {
    if (currentKey !== null && edits[currentKey] !== undefined) return currentKey;
    return [...entries].reverse().find((e) => edits[e.key] !== undefined)?.key;
  });
  useEffect(() => {
    const row = Array.from(listRef.current?.children ?? []).find((li) => li.getAttribute('data-send') === firstInView);
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [firstInView]);

  // The focus is the dialog's while it is open; the chat input underneath takes it back on its own schedule.
  useEffect(() => {
    dialogRef.current?.focus();
    const keepInside = (e: FocusEvent) => {
      const dialog = dialogRef.current;
      if (dialog && e.target instanceof Node && !dialog.contains(e.target)) dialog.focus();
    };
    document.addEventListener('focusin', keepInside);
    return () => document.removeEventListener('focusin', keepInside);
  }, []);

  useEscapeLayer(() => {
    onClose();
    return true;
  });

  return (
    <Portal>
      <div
        data-testid="history-modal-scrim"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="flex w-full max-w-2xl max-h-[80vh] flex-col overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-2xl outline-none"
        >
          <div className="flex flex-shrink-0 items-center justify-between px-4 pt-4 pb-3">
            <h2 id={titleId} className="text-md font-semibold text-[var(--tr-text)]">
              {t('chatInput.history.modal.title')}
            </h2>
            <button
              type="button"
              aria-label={tc('confirmDialog.close')}
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <ol ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {entries.map((entry, at) => (
              <HistoryRow
                key={entry.key}
                {...props}
                entry={entry}
                number={at + 1}
                numberWidth={String(entries.length).length}
                isOpen={opened.has(entry.key)}
                onToggle={() => toggle(entry.key)}
              />
            ))}
          </ol>
        </div>
      </div>
    </Portal>
  );
}

type RowProps = Props & { entry: SendIndexEntry; number: number; numberWidth: number; isOpen: boolean; onToggle: () => void };

const ICON_BUTTON = 'flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-surface-tooltip hover:text-text-primary';

function HistoryRow({ entry, number, numberWidth, isOpen, onToggle, edits, currentKey, loadContent, pictureOf, onRecall, onRevert }: RowProps) {
  const { t } = useTranslation('chat');
  const { t: tt } = useTranslation('chatTools');
  const edit = edits[entry.key];
  const pictures = edit ? edit.attachments.filter((a) => a.type === 'image').length : entry.images;
  const words = (edit ? edit.text : entry.text).trim();
  const preview = words !== '' ? words : pictures > 0 ? tt('sendIndex.imageOnly') : t('chatInput.history.modal.empty');
  const previewClass = words === '' ? 'text-text-tertiary' : '';

  return (
    <li data-send={entry.key} className={`rounded-lg ${entry.key === currentKey ? 'bg-surface-hover/50' : ''}`}>
      <div className="flex items-start gap-1 rounded-lg pe-1 hover:bg-surface-hover">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-baseline gap-2 px-2 py-1.5 text-start text-sm text-[var(--tr-text)]"
        >
          <span className="shrink-0 text-end text-xs tabular-nums text-text-tertiary" style={{ minWidth: `${numberWidth}ch` }}>{number}</span>
          {isOpen ? (
            edit ? (
              <FullContent content={edit} pictureOf={pictureOf} fallback={preview} />
            ) : (
              <SentContent sendKey={entry.key} loadContent={loadContent} pictureOf={pictureOf} fallback={preview} />
            )
          ) : (
            <span className={`min-w-0 flex-1 truncate ${previewClass}`}>{preview}</span>
          )}
        </button>
        <div className="mt-1 flex shrink-0 items-center gap-1">
          {!isOpen && pictures > 0 && <PhotoIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />}
          {/* The dot that marks the edit turns into the button that discards it under the pointer. A screen without a
              pointer to hover with shows the button as it is, so a tap never discards what it did not show. */}
          {edit && (
            <Tooltip content={t('chatInput.history.modal.revert')} desktop>
              <button type="button" aria-label={t('chatInput.history.modal.revert')} onClick={() => onRevert(entry.key)} className={`group/revert ${ICON_BUTTON}`}>
                <span data-testid="history-edited-dot" className="h-2 w-2 rounded-full bg-accent-claude group-hover/revert:hidden group-focus-visible/revert:hidden [@media(hover:none)]:hidden" />
                <XMarkIcon className="hidden h-3.5 w-3.5 group-hover/revert:block group-focus-visible/revert:block [@media(hover:none)]:block" />
              </button>
            </Tooltip>
          )}
          <Tooltip content={t('chatInput.history.modal.recall')} desktop>
            <button type="button" aria-label={t('chatInput.history.modal.recall')} onClick={() => onRecall(entry.key)} className={ICON_BUTTON}>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>
    </li>
  );
}

/** A send as it was sent, read when its row is opened. Until it is here the row's own line stands, unfolded. */
function SentContent({ sendKey, loadContent, pictureOf, fallback }: { sendKey: string; fallback: string } & Pick<Props, 'loadContent' | 'pictureOf'>) {
  const { t } = useTranslation('chat');
  const [read, setRead] = useState<{ content: ComposerContent | undefined } | null>(null);
  const loadRef = useRef(loadContent);
  loadRef.current = loadContent;

  useEffect(() => {
    let gone = false;
    void loadRef.current(sendKey).then((content) => {
      if (!gone) setRead({ content });
    });
    return () => { gone = true; };
  }, [sendKey]);

  if (read?.content) return <FullContent content={read.content} pictureOf={pictureOf} fallback={fallback} />;
  return (
    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
      {fallback}
      {read && <span className="block text-xs text-text-tertiary">{t('chatInput.history.modal.unavailable')}</span>}
    </span>
  );
}

/** All a composer content holds, in the place of the row's line: its cards, its words, its pictures and files. */
function FullContent({ content, pictureOf, fallback }: { content: ComposerContent; fallback: string } & Pick<Props, 'pictureOf'>) {
  const pictures = content.attachments.filter((a) => a.type === 'image');
  const files = content.attachments.filter((a) => a.type !== 'image');

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
      {content.replies.map((reply) => (
        <span key={reply.id} className="block border-s-2 border-border-default ps-2">
          <span className="line-clamp-3 whitespace-pre-wrap break-words text-xs text-text-tertiary">{reply.quote}</span>
          {reply.comment !== '' && <span className="block whitespace-pre-wrap break-words">{reply.comment}</span>}
        </span>
      ))}
      {content.text.trim() !== '' ? (
        <span className="whitespace-pre-wrap break-words">{content.text}</span>
      ) : (
        content.replies.length === 0 && <span className="text-text-tertiary">{fallback}</span>
      )}
      {pictures.length > 0 && (
        <span className="flex flex-wrap gap-1.5">
          {pictures.map((picture) => {
            const data = pictureOf(picture.id);
            return data === undefined ? (
              <span key={picture.id} className="text-xs text-text-tertiary">{picture.name}</span>
            ) : (
              <img key={picture.id} src={`data:${picture.mimeType ?? 'image/png'};base64,${data}`} alt={picture.name} className="max-h-24 rounded border border-border-subtle" />
            );
          })}
        </span>
      )}
      {files.map((file) => (
        <span key={file.id} className="text-xs text-text-secondary">{file.name}</span>
      ))}
    </span>
  );
}
