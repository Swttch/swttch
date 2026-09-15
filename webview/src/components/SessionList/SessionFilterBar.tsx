import { useState } from 'react';
import Tippy from '@tippyjs/react/headless';
import { useTranslation } from '@/i18n';
import { useSessionListScale } from './scale';
import { SessionActivity } from '@/shared';

/** Whether a session has a tab showing it. */
export enum TabState {
  Open = 'open',
  Closed = 'closed',
}

/** The three states a row can report. Idle is the absence of one, so not listed. */
export type StatusFilterKey =
  | SessionActivity.Awaiting
  | SessionActivity.Running
  | SessionActivity.Done;

/** How many sessions sit in each state the bar can report. */
export interface SessionCounts {
  [SessionActivity.Awaiting]: number;
  [SessionActivity.Running]: number;
  [SessionActivity.Done]: number;
  [TabState.Open]: number;
  [TabState.Closed]: number;
}

interface Props {
  counts: SessionCounts;
  /** Statuses the list is narrowed to. Empty means every status passes. */
  statusFilter: Set<StatusFilterKey>;
  onStatusFilterChange: (next: Set<StatusFilterKey>) => void;
  /** Tab states the list is narrowed to. Empty means both pass. */
  tabFilter: Set<TabState>;
  onTabFilterChange: (next: Set<TabState>) => void;
  /** Only sessions that need input, are working, or are unread are shown. */
  activeOnly: boolean;
  onActiveOnlyChange: (next: boolean) => void;
}

const STATUS_ORDER: StatusFilterKey[] = [
  SessionActivity.Awaiting,
  SessionActivity.Running,
  SessionActivity.Done,
];

const TAB_ORDER: TabState[] = [TabState.Open, TabState.Closed];

/**
 * Shared shape for the two buttons on the bar.
 *
 * The height is stated rather than left to the contents. One button holds only
 * icons and the other holds text, and text carries a line-height the icons do
 * not, so letting each size itself left the pair visibly uneven.
 */
const BAR_BUTTON = 'flex items-center h-6 px-1.5 rounded transition-colors';

/** Add or remove one value, without mutating the set the caller handed us. */
function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

/**
 * Counts and filters, between the search box and the rows.
 *
 * The filters live behind a funnel rather than along the bar because there are
 * five of them: spread out they would take more width than the list itself has,
 * and the question they answer is asked occasionally while the bar is on screen
 * the whole time.
 *
 * Every filter is a toggle, and an empty selection means "no opinion" rather
 * than "nothing". Selecting none and selecting all would otherwise be different
 * ways of saying the same thing, and one of them would have to show an empty
 * list to stay literal.
 *
 * The bar itself carries one shortcut, for the union of the three statuses that
 * are not finished with the user. That union is what someone actually wants
 * when they ask "what still needs me", and building it by hand means three
 * clicks inside a menu.
 *
 * The menu is a Tippy rather than an absolutely positioned box, for the reason
 * `SendActionMenu` is: this bar lives inside the session dropdown, which clips
 * its own overflow, and an in-flow box was cut off after two rows. Tippy renders
 * into `<body>`, so nothing upstream can clip it, and Popper keeps it on screen
 * near an edge.
 */
export function SessionFilterBar(props: Props) {
  const {
    counts,
    statusFilter,
    onStatusFilterChange,
    tabFilter,
    onTabFilterChange,
    activeOnly,
    onActiveOnlyChange,
  } = props;
  const { t } = useTranslation('common');
  const scale = useSessionListScale();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const activeCount =
    counts[SessionActivity.Awaiting] + counts[SessionActivity.Running] + counts[SessionActivity.Done];
  const hasFilter = statusFilter.size > 0 || tabFilter.size > 0;

  return (
    <div className={`flex items-center gap-1 ${scale.searchPad} pt-0`}>
      <Tippy
        // Controlled: a menu opened by a click, not a hover tooltip.
        visible={isMenuOpen}
        // Tippy's own outside-click handling, on mousedown, so the click that
        // dismisses still reaches whatever it landed on.
        onClickOutside={() => setIsMenuOpen(false)}
        interactive
        placement="bottom-start"
        offset={[0, 4]}
        appendTo={() => document.body}
        render={(attrs) => (
          <div
            role="menu"
            data-testid="session-filter-menu"
            className="min-w-[11rem] rounded-md border border-border-default bg-surface-overlay shadow-xl py-1 z-50"
            {...attrs}
          >
            <FilterGroup label={t('sessionList.filter.status')}>
              {STATUS_ORDER.map((key) => (
                <FilterRow
                  key={key}
                  label={t(
                    key === SessionActivity.Done
                      ? 'sessionList.filter.completed'
                      : `sessionList.activity.${key}`,
                  )}
                  value={counts[key]}
                  selected={statusFilter.has(key)}
                  onToggle={() => onStatusFilterChange(toggled(statusFilter, key))}
                  testId={`session-filter-status-${key}`}
                />
              ))}
            </FilterGroup>
            <div className="my-1 border-t border-border-default" />
            <FilterGroup label={t('sessionList.filter.tabs')}>
              {TAB_ORDER.map((key) => (
                <FilterRow
                  key={key}
                  label={t(`sessionList.filter.${key}`)}
                  value={counts[key]}
                  selected={tabFilter.has(key)}
                  onToggle={() => onTabFilterChange(toggled(tabFilter, key))}
                  testId={`session-filter-tab-${key}`}
                />
              ))}
            </FilterGroup>
          </div>
        )}
      >
        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-expanded={isMenuOpen}
          data-testid="session-filter-toggle"
          title={t('sessionList.filter.countsTitle')}
          className={`${BAR_BUTTON} gap-0.5 ${
            isMenuOpen || hasFilter
              ? 'text-text-primary bg-[var(--surface-selected)]'
              : 'text-text-tertiary hover:text-text-primary hover:bg-[var(--surface-selected)]'
          }`}
        >
          <FunnelIcon />
          <ChevronIcon />
        </button>
      </Tippy>

      <button
        type="button"
        onClick={() => onActiveOnlyChange(!activeOnly)}
        aria-pressed={activeOnly}
        data-testid="session-active-filter"
        title={t('sessionList.filter.activeTitle')}
        className={`${BAR_BUTTON} gap-1 ${scale.itemTime} ${
          activeOnly
            ? 'text-text-primary bg-[var(--surface-selected)]'
            : 'text-text-tertiary hover:text-text-primary hover:bg-[var(--surface-selected)]'
        }`}
      >
        <BoltIcon />
        <span>
          {t('sessionList.filter.active')} · {activeCount}
        </span>
      </button>

    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-2.5 py-1 text-[10px] uppercase tracking-wide text-text-tertiary">
        {label}
      </div>
      {children}
    </div>
  );
}

function FilterRow(props: {
  label: string;
  value: number;
  selected: boolean;
  onToggle: () => void;
  testId: string;
}) {
  const { label, value, selected, onToggle, testId } = props;
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={selected}
      data-testid={testId}
      onClick={onToggle}
      className={`w-full flex items-center gap-2 px-2.5 py-1 text-xs transition-colors ${
        selected
          ? 'text-text-primary bg-[var(--surface-selected)]'
          : 'text-text-secondary hover:bg-[var(--surface-selected)]'
      }`}
    >
      {/* The tick keeps its width when absent, so the labels stay in a column
          instead of shifting sideways as filters go on and off. */}
      <span className="w-3 shrink-0 text-center" aria-hidden="true">
        {selected ? '✓' : ''}
      </span>
      <span className="flex-1 min-w-0 truncate text-start">{label}</span>
      <span className="text-text-tertiary tabular-nums">{value}</span>
    </button>
  );
}

function FunnelIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M1.5 2h9L7 6.25V10L5 9V6.25z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <path d="M1.5 3l2.5 2.5L6.5 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M6.75 1L2.5 6.75h2.5L5.25 11 9.5 5.25H7z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
