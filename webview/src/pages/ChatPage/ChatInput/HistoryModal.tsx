import { useEffect, useId, useRef, useState } from 'react';
import { ChevronRightIcon, PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Portal } from '@/components/Portal';
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
  onJump: (key: string) => void;
  /** Give up the edit of a send. */
  onRevert: (key: string) => void;
  onClose: () => void;
}

/**
 * The history of the composer in one list (#735): every send of the session, newest first, folded to a line each. A
 * send with an edit kept is marked, starts open, and shows the edit. From here one goes to a send, or gives up its
 * edit.
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
            {entries
              .map((entry, at) => (
                <HistoryRow
                  key={entry.key}
                  {...props}
                  entry={entry}
                  number={at + 1}
                  isOpen={opened.has(entry.key)}
                  onToggle={() => toggle(entry.key)}
                />
              ))
              .reverse()}
          </ol>
        </div>
      </div>
    </Portal>
  );
}

type RowProps = Props & { entry: SendIndexEntry; number: number; isOpen: boolean; onToggle: () => void };

function HistoryRow({ entry, number, isOpen, onToggle, edits, currentKey, loadContent, pictureOf, onJump, onRevert }: RowProps) {
  const { t } = useTranslation('chat');
  const { t: tt } = useTranslation('chatTools');
  const bodyId = useId();
  const edit = edits[entry.key];
  const pictures = edit ? edit.attachments.filter((a) => a.type === 'image').length : entry.images;
  const words = (edit ? edit.text : entry.text).trim();
  const preview = words !== '' ? words : pictures > 0 ? tt('sendIndex.imageOnly') : t('chatInput.history.modal.empty');

  return (
    <li data-send={entry.key} className={`rounded-lg ${entry.key === currentKey ? 'bg-surface-hover/50' : ''}`}>
      <div className="flex items-center gap-1 pe-2">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm text-[var(--tr-text)] hover:bg-surface-hover"
        >
          <ChevronRightIcon className={`h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          <span className="w-7 shrink-0 text-end text-xs tabular-nums text-text-tertiary">{number}</span>
          <span className={`min-w-0 flex-1 truncate ${words === '' ? 'text-text-tertiary' : ''}`}>{preview}</span>
          {pictures > 0 && <PhotoIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />}
          {edit && (
            <span className="shrink-0 rounded border border-accent-claude/60 px-1 text-[0.6875rem] leading-4 text-accent-claude">
              {t('chatInput.history.modified')}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onJump(entry.key)}
          className="shrink-0 rounded px-2 py-1 text-xs text-text-secondary hover:bg-surface-tooltip hover:text-text-primary"
        >
          {t('chatInput.history.modal.jump')}
        </button>
      </div>
      {isOpen && (
        <div id={bodyId} className="ms-[4.125rem] me-2 pb-2">
          {edit ? <ContentView content={edit} pictureOf={pictureOf} /> : <SentView sendKey={entry.key} loadContent={loadContent} pictureOf={pictureOf} />}
          {edit && (
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={() => onRevert(entry.key)}
                className="rounded border border-border-default px-2 py-1 text-xs text-text-secondary hover:bg-surface-tooltip hover:text-text-primary"
              >
                {t('chatInput.history.modal.revert')}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** A send as it was sent, read when its row is opened. */
function SentView({ sendKey, loadContent, pictureOf }: { sendKey: string } & Pick<Props, 'loadContent' | 'pictureOf'>) {
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

  if (read?.content) return <ContentView content={read.content} pictureOf={pictureOf} />;
  return <p className="text-xs text-text-tertiary">{t(read ? 'chatInput.history.modal.unavailable' : 'chatInput.history.modal.loading')}</p>;
}

/** What a composer content holds: its cards, its words, its pictures and files. */
function ContentView({ content, pictureOf }: { content: ComposerContent } & Pick<Props, 'pictureOf'>) {
  const { t } = useTranslation('chat');
  const pictures = content.attachments.filter((a) => a.type === 'image');
  const files = content.attachments.filter((a) => a.type !== 'image');
  const isEmpty = content.text === '' && content.attachments.length === 0 && content.replies.length === 0;

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border-subtle px-2.5 py-2 text-sm text-[var(--tr-text)]">
      {content.replies.map((reply) => (
        <div key={reply.id} className="border-s-2 border-border-default ps-2">
          <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs text-text-tertiary">{reply.quote}</p>
          {reply.comment !== '' && <p className="whitespace-pre-wrap break-words">{reply.comment}</p>}
        </div>
      ))}
      {content.text !== '' && <p className="whitespace-pre-wrap break-words">{content.text}</p>}
      {pictures.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pictures.map((picture) => {
            const data = pictureOf(picture.id);
            return data === undefined ? (
              <span key={picture.id} className="text-xs text-text-tertiary">{picture.name}</span>
            ) : (
              <img key={picture.id} src={`data:${picture.mimeType ?? 'image/png'};base64,${data}`} alt={picture.name} className="max-h-24 rounded border border-border-subtle" />
            );
          })}
        </div>
      )}
      {files.map((file) => (
        <span key={file.id} className="text-xs text-text-secondary">{file.name}</span>
      ))}
      {isEmpty && <p className="text-text-tertiary">{t('chatInput.history.modal.empty')}</p>}
    </div>
  );
}
