import { useState, useRef, useEffect } from 'react';
import { SessionMetaDto } from '@/dto';
import { getRelativeTime } from './utils';
import { useSessionListScale } from './scale';
import { useTranslation } from '@/i18n';
import { SessionActivity } from '@/shared';

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
  /**
   * What this session is doing, so the row can mark it (issue #449). Decided by
   * the caller from the backend's map, because a row can be working in a tab
   * this list knows nothing about.
   */
  activity?: SessionActivity;
  /**
   * A tab currently has this session open. A closed session draws no marker at
   * all: nothing is watching it, so there is no state to report, and colouring
   * one anyway would say "idle" about a session that is merely absent.
   */
  isOpen?: boolean;
}

/** Dot colour per state. Only Running adds the turning ring. */
const ACTIVITY_COLOR: Record<SessionActivity, string> = {
  [SessionActivity.Running]: 'text-text-link',
  [SessionActivity.Awaiting]: 'text-state-warning-fg',
  [SessionActivity.Done]: 'text-state-success-fg',
  [SessionActivity.Idle]: 'text-text-tertiary',
};

/**
 * The marker a row wears, saying what its session is doing.
 *
 * Drawn only for a session some tab has open. A closed session has no state to
 * report — nothing is running it and nothing is watching it — so the row leaves
 * the marker off entirely, taking its width with it: a reserved blank indents
 * every closed title against nothing, and closed rows are the common case.
 *
 * Only a running session adds the turning ring: colour alone says what a
 * session is, and the ring is what says something is still happening. The shape
 * is the one the workflow agent picker uses (`AgentTranscriptModal/AgentChip`).
 *
 * The box is a fixed 14px in every state it IS drawn in, so a title does not
 * shift sideways as its session moves between them.
 */
function ActivityDot({ activity, isOpen }: { activity: SessionActivity; isOpen: boolean }) {
  const { t } = useTranslation('common');
  if (!isOpen) return null;
  return (
    <span
      className={`relative inline-flex w-3.5 h-3.5 shrink-0 items-center justify-center ${ACTIVITY_COLOR[activity]}`}
      data-testid="session-activity"
      data-activity={activity}
      title={t(`sessionList.activity.${activity}`)}
    >
      {activity === SessionActivity.Running && (
        <span className="absolute inset-0 rounded-full border border-current border-e-transparent border-b-transparent animate-spin" />
      )}
      <span className="inline-block w-2 h-2 rounded-full bg-current" />
    </span>
  );
}

export function SessionItem(props: Props) {
  const {
    session,
    isSelected,
    isHighlighted = false,
    onSelect,
    onDelete,
    onRename,
    originLabel,
    activity = SessionActivity.Idle,
    isOpen = false,
  } = props;
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


  // A <button> may not contain an <input>, and while renaming the row must not
  // act as one anyway — clicking into the field would otherwise also open the
  // session. The row keeps its looks and drops to a plain container instead.
  const Row = isEditing ? 'div' : 'button';

  return (
    <Row
      ref={buttonRef as never}
      onClick={isEditing ? undefined : onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`w-full ${scale.itemPad} text-start ${scale.itemText} rounded transition-colors flex justify-between items-center gap-1 ${
        isSelected || isHighlighted
          ? 'text-text-primary bg-[var(--surface-selected)]'
          : 'text-text-secondary hover:text-text-primary hover:bg-[var(--surface-selected)]'
      }`}
      title={isEditing ? undefined : session.title}
    >
      {/* The marker leads the whole ROW rather than the title line, so it stays
          centred against the text no matter whether that is one line or two.
          Inside the title line it sat half-way down a two-line row and looked
          indented under the project path above it. Out here it is also outside
          the renaming branch entirely, so it cannot blink out while the field
          is open. */}
      <ActivityDot activity={activity} isOpen={isOpen} />
      {/* The origin sits ABOVE the title rather than beside it: squeezed onto
          one row it competed with the title for the same horizontal space and
          both ended up truncated, which is worse than either alone. */}
      <span className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {originLabel && (
          <span
            className={`${scale.itemTime} text-text-tertiary truncate`}
            title={session.sessionDir}
          >
            {originLabel}
          </span>
        )}
        {/* Renaming swaps only the TITLE line for an input. Replacing the whole
            row instead would take the project line down with it, so the row
            being renamed would lose the very context that tells the user which
            of several same-named conversations they are editing. */}
        {isEditing ? (
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
        ) : (
          <span className="truncate">{session.title}</span>
        )}
      </span>
      {isHovered && !isEditing ? (
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
    </Row>
  );
}
