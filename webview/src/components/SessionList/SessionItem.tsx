import { useState, useRef, useEffect } from 'react';
import { SessionMetaDto } from '@/dto';
import { getRelativeTime } from './utils';
import { useSessionListScale } from './scale';
import { useTranslation } from '@/i18n';

interface Props {
  session: SessionMetaDto;
  isSelected: boolean;
  /** Keyboard-navigation highlight (distinct from isSelected = current session). */
  isHighlighted?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  /**
   * Path of the session's own directory relative to the one being browsed,
   * shown when the two differ. The caller decides that — the row does not know
   * what the list is anchored to.
   */
  originLabel?: string;
}

export function SessionItem(props: Props) {
  const { session, isSelected, isHighlighted = false, onSelect, onDelete, onRename, originLabel } =
    props;
  const { t } = useTranslation('common');
  const scale = useSessionListScale();
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Keep the keyboard-highlighted row in view as the user arrows through.
  // scrollIntoView is absent in jsdom (and some headless environments), so call
  // it defensively.
  useEffect(() => {
    if (isHighlighted) {
      buttonRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [isHighlighted]);
  // Escape cancels editing by unmounting the input, which can fire a trailing
  // blur. This flag tells the blur handler to skip committing in that case.
  const skipCommitRef = useRef(false);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(session.title);
    skipCommitRef.current = false;
    setIsEditing(true);
  };

  const commit = () => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      setIsEditing(false);
      return;
    }
    const trimmed = draft.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const cancel = () => {
    skipCommitRef.current = true;
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  if (isEditing) {
    return (
      <div
        className={`w-full ${scale.itemPad} rounded flex items-center ${
          isSelected ? 'bg-[var(--surface-selected)]' : ''
        }`}
      >
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          className={`w-full bg-transparent ${scale.itemText} text-text-primary outline-none border-b border-text-tertiary/40`}
        />
      </div>
    );
  }

  return (
    <button
      ref={buttonRef}
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`w-full ${scale.itemPad} text-start ${scale.itemText} rounded transition-colors flex justify-between items-center gap-2 ${
        isSelected || isHighlighted
          ? 'text-text-primary bg-[var(--surface-selected)]'
          : 'text-text-secondary hover:text-text-primary hover:bg-[var(--surface-selected)]'
      }`}
      title={session.title}
    >
      <span className="truncate flex-1">{session.title}</span>
      {originLabel && (
        <span
          className={`flex-shrink-0 ${scale.itemTime} px-1 py-0.5 rounded bg-surface-overlay text-text-tertiary max-w-[8rem] truncate`}
          title={session.sessionDir}
        >
          {originLabel}
        </span>
      )}
      {isHovered ? (
        <span className="flex-shrink-0 flex items-center gap-1.5">
          <span
            role="button"
            onClick={startEditing}
            className="text-text-tertiary hover:text-text-primary transition-colors flex items-center justify-center"
            title={t('sessionList.renameSession')}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M8.25 1.75l2 2M9.5 1.5a.7.7 0 0 1 1 1l-6 6L2 9.5l.5-2.5z"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span
            role="button"
            onClick={handleDelete}
            className="text-text-tertiary hover:text-state-error-fg transition-colors flex items-center justify-center"
            title={t('sessionList.deleteSession')}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1.5 3h9M4.5 3V2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M2.5 3l.5 7a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5l.5-7"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5 5.5v3M7 5.5v3"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </span>
      ) : session.updatedAt ? (
        <span className={`flex-shrink-0 ${scale.itemTime} text-text-tertiary`}>
          {getRelativeTime(session.updatedAt)}
        </span>
      ) : null}
    </button>
  );
}
