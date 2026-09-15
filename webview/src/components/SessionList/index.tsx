import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GroupedSessions, GROUP_ORDER, getSessionOriginLabel } from './utils';
import { SessionItem } from './SessionItem';
import { useSessionListScale } from './scale';
import { useTranslation } from '@/i18n';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { useSessionContextOrNull } from '@/contexts/SessionContext';
import { useSessionActivity, activityOf } from '@/hooks/useSessionActivity';
import {
  SessionFilterBar,
  TabState,
  type SessionCounts,
  type StatusFilterKey,
} from './SessionFilterBar';
import { SessionActivity } from '@/shared';

interface Props {
  groupedSessions: GroupedSessions;
  currentSessionId: string | null;
  /** Session highlighted via keyboard navigation (distinct from the current session). */
  highlightedSessionId?: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  /** 스크롤 영역 높이 제어. 드롭다운은 max-h-80, 사이드 패널은 flex-1 min-h-0 */
  className?: string;
  /**
   * Fetch the next page. Called when the scroll nears the end, and again right
   * after a page renders if the list still does not fill its own viewport —
   * without that, a short first page leaves nothing to scroll and the rest of
   * the list becomes unreachable.
   */
  onLoadMore?: () => void;
  /** Sessions exist past the ones rendered. Nothing is requested when false. */
  hasMore?: boolean;
}

// How close to the bottom, in pixels, counts as "about to run out".
const LOAD_MORE_THRESHOLD_PX = 200;

export function SessionList(props: Props) {
  const { groupedSessions, currentSessionId, highlightedSessionId = null, onSelectSession, onDeleteSession, onRenameSession, className = 'max-h-80', onLoadMore, hasMore = false } = props;
  const scale = useSessionListScale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation('common');
  // Tolerate a missing provider: this list also renders in contexts that do not
  // mount one, and an origin badge is not worth making the component unusable
  // there — without an anchor there is simply nothing to compare against.
  const rootDir = useWorkingDirOrNull()?.rootDir ?? null;

  // Asked for here rather than by each caller, because both surfaces that show
  // sessions (the header dropdown and the side panel) render this one component
  // and would otherwise each have to remember to pass it through.
  const { activity, open } = useSessionActivity();

  // Whether the list is narrowed to the sessions that are not finished with the
  // user. Local to the list rather than lifted: it is a way of looking at these
  // rows, not a fact about the session the app is showing, and both surfaces
  // that mount this component want their own.
  const [activeOnly, setActiveOnly] = useState(false);
  // Empty means "no opinion" rather than "nothing": selecting none and selecting
  // all would otherwise say the same thing, and one of them would have to show
  // an empty list to stay literal.
  const [statusFilter, setStatusFilter] = useState<Set<StatusFilterKey>>(() => new Set());
  const [tabFilter, setTabFilter] = useState<Set<TabState>>(() => new Set());

  // Counted over the rows the list is holding — what the user can see — rather
  // than over every session on disk. A count that included rows behind a search
  // or past the loaded page would name a number nothing on screen adds up to.
  const counts = useMemo<SessionCounts>(() => {
    const tally: SessionCounts = {
      [SessionActivity.Awaiting]: 0,
      [SessionActivity.Running]: 0,
      [SessionActivity.Done]: 0,
      [TabState.Open]: 0,
      [TabState.Closed]: 0,
    };
    for (const key of GROUP_ORDER) {
      for (const session of groupedSessions[key]) {
        const isOpen = open.has(session.id);
        if (isOpen) tally[TabState.Open]++;
        else tally[TabState.Closed]++;
        // A closed session reports no state, exactly as its row draws no
        // marker, so it is not counted into any of the three above.
        if (!isOpen) continue;
        const state = activityOf(activity, session.id);
        if (state !== SessionActivity.Idle) tally[state]++;
      }
    }
    return tally;
  }, [groupedSessions, activity, open]);

  // The filter keeps the same three states the Active count adds up, so the
  // number on the button is exactly how many rows survive it.
  const isActive = useCallback(
    (sessionId: string) =>
      open.has(sessionId) && activityOf(activity, sessionId) !== SessionActivity.Idle,
    [activity, open],
  );

  // Every filter that is set has to pass. An unset one says nothing, so it
  // cannot hide a row; a closed session has no status at all, so it never
  // satisfies a status filter.
  const passesFilters = useCallback(
    (sessionId: string) => {
      if (activeOnly && !isActive(sessionId)) return false;
      const isOpen = open.has(sessionId);
      if (tabFilter.size > 0 && !tabFilter.has(isOpen ? TabState.Open : TabState.Closed)) {
        return false;
      }
      if (statusFilter.size > 0) {
        if (!isOpen) return false;
        const state = activityOf(activity, sessionId);
        if (state === SessionActivity.Idle) return false;
        if (!statusFilter.has(state as StatusFilterKey)) return false;
      }
      return true;
    },
    [activeOnly, isActive, open, tabFilter, statusFilter, activity],
  );

  const hasFilter = activeOnly || statusFilter.size > 0 || tabFilter.size > 0;

  const visibleGroups = useMemo(() => {
    if (!hasFilter) return groupedSessions;
    const filtered = {} as GroupedSessions;
    for (const key of GROUP_ORDER) {
      filtered[key] = groupedSessions[key].filter((session) => passesFilters(session.id));
    }
    return filtered;
  }, [hasFilter, groupedSessions, passesFilters]);

  const visibleCount = useMemo(
    () => GROUP_ORDER.reduce((n, key) => n + visibleGroups[key].length, 0),
    [visibleGroups],
  );

  // Taken from the side that walked the directories, not guessed from the rows.
  //
  // The rows cannot answer this once the list is paged. A page holds the newest
  // N sessions, and those can all belong to the anchor while every other
  // directory sits further down — so "no foreign row here" means "not yet",
  // never "not merged". Guessing from the rows made a merged list render with
  // no origin labels at all until the user scrolled far enough to reach a
  // session from a sub-project, at which point labels appeared on every row
  // that was already on screen and pushed the list down.
  //
  // Reading the SETTING instead would be wrong in the other direction: it can
  // be on while the anchor has no sub-projects with sessions in them, and then
  // there is nothing to disambiguate and no reason to spend a second line on
  // every row. The count answers both, because the backend only counts
  // directories that actually contributed a session.
  const scopeDirCount = useSessionContextOrNull()?.scopeDirCount ?? null;
  const isMerged = useMemo(() => {
    // A backend that reported a count has settled it; nothing here overrides.
    if (scopeDirCount !== null) return scopeDirCount > 1;
    // Nobody said, so fall back on the only evidence available locally. Right
    // whenever a foreign row is already loaded, and no worse than the guess
    // this replaced when one is not.
    return GROUP_ORDER.flatMap((key) => groupedSessions[key]).some(
      (s) => s.sessionDir && s.sessionDir !== rootDir,
    );
  }, [scopeDirCount, groupedSessions, rootDir]);

  const requestMoreIfNeeded = useCallback(() => {
    if (!hasMore || !onLoadMore) return;
    const el = scrollRef.current;
    if (!el) return;
    // A box with no height has not been laid out, or is not on screen at all —
    // the closed dropdown renders this list before it is opened. Its scroll
    // metrics are all zero, which reads as "the rows do not fill the box" and
    // would fetch page after page for a list nobody is looking at. Measured
    // doing exactly that: offset ran 31 → 125 → 156 without a single scroll.
    if (el.clientHeight === 0) return;
    // Otherwise: too little left below the fold means the rows are about to run
    // out, and a list shorter than its own box has nothing to scroll at all.
    const room = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (room <= LOAD_MORE_THRESHOLD_PX) onLoadMore();
  }, [hasMore, onLoadMore]);

  // Runs after every render that changes the rows, which covers both the first
  // page being short and a page arriving without moving the scroll position.
  useEffect(() => {
    requestMoreIfNeeded();
  }, [groupedSessions, requestMoreIfNeeded]);

  return (
    <>
      <SessionFilterBar
        counts={counts}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        tabFilter={tabFilter}
        onTabFilterChange={setTabFilter}
        activeOnly={activeOnly}
        onActiveOnlyChange={setActiveOnly}
      />
      <div
        ref={scrollRef}
        onScroll={requestMoreIfNeeded}
        className={`${className} overflow-y-auto ${scale.listPad} flex flex-col gap-0.5`}
      >
        {hasFilter && visibleCount === 0 && (
          <div className="px-2.5 py-3 text-xs text-text-tertiary text-center">
            {t('sessionList.filter.noneActive')}
          </div>
        )}
        {GROUP_ORDER.map((groupKey) => {
        const sessionsInGroup = visibleGroups[groupKey];
        if (sessionsInGroup.length === 0) return null;

        return (
          <div key={groupKey}>
            <div className={`${scale.groupHeader} text-text-tertiary`}>
              {t(`sessionList.groups.${groupKey}`)}
            </div>
            {sessionsInGroup.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isSelected={session.id === currentSessionId}
                isHighlighted={session.id === highlightedSessionId}
                originLabel={
                  isMerged ? getSessionOriginLabel(session.sessionDir, rootDir) : undefined
                }
                activity={activityOf(activity, session.id)}
                isOpen={open.has(session.id)}
                onSelect={() => onSelectSession(session.id)}
                onDelete={() => onDeleteSession(session.id)}
                onRename={(title) => onRenameSession(session.id, title)}
              />
            ))}
          </div>
        );
        })}
      </div>
    </>
  );
}
