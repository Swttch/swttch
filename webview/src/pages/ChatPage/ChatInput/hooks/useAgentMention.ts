import { useCallback, useRef, useState, type RefObject } from 'react';
import { findAgentToken, AGENT_TRIGGER } from '@/utils/findAgentToken';
import { useActiveSessions } from '@/hooks/queries/useActiveSessions';
import { toTitle, NO_TITLE } from '@/mappers/sessionTransformer';
import type { ActiveSessionAgent, ActiveSessionEntry } from '@/shared';
import { basename } from '../basename';
import { replaceRangeWithText } from '../RichInput/replaceRangeWithText';

/**
 * The active-session panel: `@@` opens it, picking a row addresses the message
 * being written to that session.
 *
 * Addressing rather than pasting is what separates this from the prompt library
 * next door. `!!` hands the user text they then edit; `@@` hands them a
 * recipient. So the `@@query` token is replaced in place by a chip naming the
 * session, the way a mention reads in any other composer, and the address rides
 * along beside it.
 *
 * The chip stays in the user's own bubble and is cut off what travels: it is how
 * they addressed the message, so it belongs in the record of what they said, and
 * it is not words, so it does not belong in what the other session reads.
 */

/** One row of the panel: the CLI's agent, and the session row that names it. */
export interface ActiveSessionRow {
  agent: ActiveSessionAgent;
  /** Absent when the session's transcript could not be read. */
  entry?: ActiveSessionEntry;
}

/** Who the message being written is addressed to. */
export interface AgentRecipient {
  /**
   * The address. This is what the message is sent to.
   *
   * A LIVE handle, not a permanent identifier. Measured: one session
   * (`458fa4b4-…`) was listed as `claude-code-gui-jetbrains-36` at pid 53662 and
   * later as `claude-code-gui-jetbrains-57` at pid 36300 — same conversation,
   * restarted process, new name. So a name held across a restart addresses
   * nothing, which is why {@link sessionId} travels with it.
   */
  name: string;
  /**
   * The conversation this name belonged to, which does NOT change when the
   * process does. Nothing reads it yet; it is what a re-resolve would key on if
   * a send ever has to find the current name for a session picked earlier.
   */
  sessionId: string;
  /**
   * The project the session belongs to. The list spans the whole machine, so
   * opening the session later has to land in ITS project, not this one.
   */
  sessionDir: string;
  /** What the chip says, so the user reads a session title rather than an id. */
  label: string;
  /**
   * The exact run of text standing in the composer for this recipient, e.g.
   * `@@fix the proxy`. Highlighted as a chip by RichInput, matched literally,
   * and cut off the body before it is delivered.
   */
  token: string;
}

/** How much of a title an inline chip carries before it crowds the line. */
const TOKEN_LABEL_MAX = 24;

/**
 * The inline chip's text: the `@@` that summoned it, and the session's title.
 *
 * Both at-signs stay. `@` alone is a file reference in this composer and in the
 * CLI, so a chip that dropped one of them would read as a path — the user types
 * `@@` to address a session and must see `@@` sitting there afterwards.
 *
 * The title is cut shorter here than in the panel. A row has the panel's full
 * width to itself, while a chip sits inside a sentence the user is still
 * writing, and a fifty-character chip pushes that sentence off the line.
 */
export function buildRecipientToken(row: ActiveSessionRow): string {
  const label = rowLabel(row);
  const short =
    label.length > TOKEN_LABEL_MAX ? `${label.slice(0, TOKEN_LABEL_MAX).trimEnd()}…` : label;
  return `${AGENT_TRIGGER}${short}`;
}

/**
 * What to call a session.
 *
 * `toTitle` is what every other session row runs its title through, so a session
 * reads here exactly as it reads in the session dropdown: system-prompt tags
 * stripped, cut at 50 characters. Used for the row, for the chip, and for
 * matching what the user types, so all three agree.
 *
 * A session with nothing to be named after falls back to its working directory,
 * which at least says where it is. See the comment inside for when that happens.
 */
export function rowLabel(row: ActiveSessionRow): string {
  const rawTitle = row.entry?.title;
  const title = rawTitle ? toTitle(rawTitle) : NO_TITLE;
  // Not just "is the raw title empty": a first prompt made entirely of system
  // tags parses away to nothing, and `toTitle` answers its placeholder. That is
  // exactly what a session started by ANOTHER session looks like, because the
  // message that started it was wrapped — so this case is common here, not
  // exotic, and "No title" on a row the user is trying to pick says nothing.
  return title === NO_TITLE ? basename(row.agent.cwd) : title;
}

/** Newest activity first, which is the order the session list is read in. */
function byRecency(a: ActiveSessionRow, b: ActiveSessionRow): number {
  const stamp = (row: ActiveSessionRow): number => {
    const last = row.entry?.lastTimestamp;
    const parsed = last ? Date.parse(last) : NaN;
    return Number.isNaN(parsed) ? row.agent.startedAt : parsed;
  };
  return stamp(b) - stamp(a);
}

/**
 * Match a session against the typed query by title and by name.
 *
 * Both, because the user may remember either: the phrase the session started
 * with, or the suffix that tells two tabs of one project apart.
 */
function matchesQuery(row: ActiveSessionRow, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    rowLabel(row).toLowerCase().includes(needle) ||
    row.agent.name.toLowerCase().includes(needle)
  );
}

interface UseAgentMentionParams {
  /**
   * The session this composer is showing. It is in the CLI's list like any
   * other, and addressing a message to the tab you are typing in is never what
   * was meant, so it is dropped from the rows.
   */
  currentSessionId: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  /**
   * The composer's editable element. The chip is written through the browser's
   * editing pipeline on this node so the insert lands in its undo history
   * (issue #286).
   */
  inputRef?: RefObject<HTMLElement | null>;
  /**
   * Called once a row is picked, with the recipient, the caret offset where the
   * `@@query` token used to start, and the full composer value that offset
   * applies to — so the composer can restore the caret and re-run the
   * caret-dependent checks that decide who owns the shared slot.
   */
  onPickRecipient: (recipient: AgentRecipient, caretOffset: number, nextValue: string) => void;
}

export interface UseAgentMentionReturn {
  isActive: boolean;
  rows: ActiveSessionRow[];
  selectedIndex: number;
  isPending: boolean;
  isFetching: boolean;
  error: string | null;
  refresh: () => void;
  detectAgent: (value: string, caretPosition: number) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLElement>) => boolean;
  selectRow: (index: number) => void;
  close: () => void;
}

export function useAgentMention(params: UseAgentMentionParams): UseAgentMentionReturn {
  const { currentSessionId, value, onChange, inputRef, onPickRecipient } = params;

  const [isActive, setIsActive] = useState(false);
  const [query, setQuery] = useState('');
  const [triggerIndex, setTriggerIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // The picked row is read inside a handler that the composer re-creates every
  // render, so a ref is not needed for `rows`. `value` is: the token removal
  // reads the value as it stands at the moment of the pick, which can be one
  // keystroke later than the render that produced the handler.
  const valueRef = useRef(value);
  valueRef.current = value;

  // Asking only while the panel is open is what makes opening it the read.
  const { agents, entries, isPending, isFetching, error, refresh } = useActiveSessions(isActive);

  const rows: ActiveSessionRow[] = agents
    .filter((agent) => agent.sessionId !== currentSessionId)
    .map((agent) => ({ agent, entry: entries[agent.sessionId] }))
    .filter((row) => matchesQuery(row, query))
    .sort(byRecency);

  const close = useCallback(() => {
    setIsActive(false);
    setQuery('');
    setTriggerIndex(-1);
    setSelectedIndex(0);
  }, []);

  const detectAgent = useCallback((nextValue: string, caretPosition: number) => {
    const token = findAgentToken(nextValue, caretPosition);
    if (!token) {
      setIsActive((wasActive) => {
        if (wasActive) {
          setQuery('');
          setTriggerIndex(-1);
          setSelectedIndex(0);
        }
        return false;
      });
      return;
    }
    setIsActive(true);
    setQuery((previous) => {
      // A changed query means a different list, so the highlight goes back to
      // the top rather than pointing at whatever now sits at the old offset.
      if (previous !== token.query) setSelectedIndex(0);
      return token.query;
    });
    setTriggerIndex(token.start);
  }, []);

  const selectRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row || triggerIndex === -1) {
        close();
        return;
      }

      const spanEnd = triggerIndex + AGENT_TRIGGER.length + query.length;
      const currentValue = valueRef.current;
      // `@@review` becomes `@@fix the proxy `, in place, the way every other
      // mention in this composer works. The trailing space is what lets the user
      // keep typing the sentence without the chip swallowing the next word.
      const token = buildRecipientToken(row);
      const inserted = `${token} `;
      const nextValue =
        currentValue.slice(0, triggerIndex) + inserted + currentValue.slice(spanEnd);
      const caretOffset = triggerIndex + inserted.length;

      close();

      const el = inputRef?.current ?? null;
      const handledByBrowser = el
        ? replaceRangeWithText(el, triggerIndex, spanEnd, inserted)
        : false;
      if (!handledByBrowser) onChange(nextValue);

      onPickRecipient(
        {
          name: row.agent.name,
          sessionId: row.agent.sessionId,
          sessionDir: row.agent.cwd,
          label: rowLabel(row),
          token,
        },
        caretOffset,
        nextValue,
      );
    },
    [rows, triggerIndex, query, inputRef, onChange, onPickRecipient, close],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>): boolean => {
      if (!isActive) return false;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (rows.length === 0 ? 0 : (i + 1) % rows.length));
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (rows.length === 0 ? 0 : (i - 1 + rows.length) % rows.length));
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        // An empty list has nothing to commit, and swallowing Enter there would
        // leave the user unable to send the message they already typed.
        if (rows.length === 0) return false;
        e.preventDefault();
        selectRow(selectedIndex);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return true;
      }
      return false;
    },
    [isActive, rows.length, selectedIndex, selectRow, close],
  );

  return {
    isActive,
    rows,
    selectedIndex,
    isPending,
    isFetching,
    error,
    refresh,
    detectAgent,
    handleKeyDown,
    selectRow,
    close,
  };
}
