import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionList } from '../index';
import { SessionMetaDto } from '@/dto';
import { SessionGroup, type GroupedSessions } from '../utils';
import { SessionActivity, type SessionActivityMap } from '@/shared';

const ROOT = '/repo';

let mockRootDir: string | null = ROOT;
vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDirOrNull: () => ({ rootDir: mockRootDir }),
}));

vi.mock('@/contexts/SessionContext', () => ({
  useSessionContextOrNull: () => ({ scopeDirCount: null }),
}));

// What the backend says each session is doing. Mocked at the hook rather than
// at the bridge, because what this file is about is the row, not the transport.
let mockActivity: SessionActivityMap = {};
let mockOpen: Set<string> = new Set();
const markRead = vi.fn();
vi.mock('@/hooks/useSessionActivity', async (importOriginal) => ({
  // activityOf travels with the hook and is pure, so the real one is kept:
  // replacing it would move the "absent means idle" rule into this file.
  ...(await importOriginal<typeof import('@/hooks/useSessionActivity')>()),
  useSessionActivity: () => ({ activity: mockActivity, open: mockOpen, markRead }),
}));

beforeEach(() => {
  mockRootDir = ROOT;
  mockActivity = {};
  // Most of these are about what an OPEN session's marker looks like, so the
  // rows they build are open unless a test says otherwise.
  mockOpen = new Set(['a', 'b', 'c', 'd']);
});

function session(id: string, title: string, sessionDir = ROOT): SessionMetaDto {
  return Object.assign(new SessionMetaDto(), {
    id,
    title,
    sessionDir,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    messageCount: 1,
    isSidechain: false,
  });
}

function grouped(sessions: SessionMetaDto[]): GroupedSessions {
  return {
    [SessionGroup.Today]: sessions,
    [SessionGroup.Yesterday]: [],
    [SessionGroup.PastWeek]: [],
    [SessionGroup.PastMonth]: [],
    [SessionGroup.PastYear]: [],
  };
}

function listElement(sessions: SessionMetaDto[]) {
  return (
    <SessionList
      groupedSessions={grouped(sessions)}
      currentSessionId={null}
      onSelectSession={vi.fn()}
      onDeleteSession={vi.fn()}
      onRenameSession={vi.fn()}
    />
  );
}

function renderList(sessions: SessionMetaDto[]) {
  render(listElement(sessions));
}

/** Same render, handing back the handle so a test can re-render with new state. */
function renderListReturning(sessions: SessionMetaDto[]) {
  return render(listElement(sessions));
}

/**
 * The marker every session row wears, saying what that session is doing
 * (issue #449).
 *
 * The state comes from the backend rather than from this webview's own stream,
 * because the list shows conversations that may be running in another tab
 * entirely — which is the case the reporter described.
 */
describe('SessionList — activity marker', () => {
  function markerFor(title: string): HTMLElement {
    const row = screen.getByText(title).closest('button, div[class*="rounded"]');
    const marker = row?.querySelector('[data-testid="session-activity"]');
    if (!marker) throw new Error(`no marker on the row for "${title}"`);
    return marker as HTMLElement;
  }

  it('gives every row a marker, whatever its session is doing', () => {
    // Always present, so the rows line up into a column of states rather than
    // shifting sideways as sessions start and stop.
    mockActivity = { b: SessionActivity.Running };
    renderList([session('a', 'idle one'), session('b', 'working one')]);

    expect(screen.getAllByTestId('session-activity')).toHaveLength(2);
  });

  it('shows each backend state on the row it belongs to', () => {
    mockActivity = {
      b: SessionActivity.Running,
      c: SessionActivity.Awaiting,
      d: SessionActivity.Done,
    };
    renderList([
      session('a', 'idle one'),
      session('b', 'working one'),
      session('c', 'asking one'),
      session('d', 'finished one'),
    ]);

    expect(markerFor('idle one').dataset.activity).toBe(SessionActivity.Idle);
    expect(markerFor('working one').dataset.activity).toBe(SessionActivity.Running);
    expect(markerFor('asking one').dataset.activity).toBe(SessionActivity.Awaiting);
    expect(markerFor('finished one').dataset.activity).toBe(SessionActivity.Done);
  });

  it('treats a session the backend did not mention as idle', () => {
    renderList([session('a', 'idle one')]);

    expect(markerFor('idle one').dataset.activity).toBe(SessionActivity.Idle);
  });

  it('turns the ring only while a session is running', () => {
    // Colour says what a session is; the ring is what says something is still
    // happening. A finished session that kept spinning would say both.
    mockActivity = { b: SessionActivity.Running, d: SessionActivity.Done };
    renderList([session('b', 'working one'), session('d', 'finished one')]);

    expect(markerFor('working one').querySelector('.animate-spin')).not.toBeNull();
    expect(markerFor('finished one').querySelector('.animate-spin')).toBeNull();
  });

  it('gives each state a different colour', () => {
    mockActivity = {
      b: SessionActivity.Running,
      c: SessionActivity.Awaiting,
      d: SessionActivity.Done,
    };
    renderList([
      session('a', 'idle one'),
      session('b', 'working one'),
      session('c', 'asking one'),
      session('d', 'finished one'),
    ]);

    const colours = ['idle one', 'working one', 'asking one', 'finished one'].map(
      (title) => markerFor(title).className.match(/text-[\w-]+/)?.[0],
    );
    expect(new Set(colours).size).toBe(4);
  });

  it('names the state in a tooltip rather than leaving the colour to be guessed', () => {
    mockActivity = { b: SessionActivity.Running };
    renderList([session('b', 'working one')]);

    const marker = markerFor('working one');
    expect(marker.getAttribute('title')).toBeTruthy();
    // Not the untranslated key: a missing string would render the key itself.
    expect(marker.getAttribute('title')).not.toContain('sessionList.activity');
  });

  it('leads the whole row rather than sitting on the title line', () => {
    // A merged list stacks the project path above the title. A marker inside
    // the title line lands half-way down such a row and reads as indented
    // under the path; leading the row, it stays centred against both lines.
    mockActivity = { b: SessionActivity.Running };
    renderList([session('b', 'working one', `${ROOT}/packages/battery`)]);

    const marker = markerFor('working one');
    const title = screen.getByText('working one');
    const origin = screen.getByText('packages/battery');
    const textColumn = title.parentElement;

    // Outside the stacked text column, and a sibling that precedes it.
    expect(textColumn).toBe(origin.parentElement);
    expect(textColumn?.contains(marker)).toBe(false);
    expect(marker.parentElement).toBe(textColumn?.parentElement);
    expect(
      marker.compareDocumentPosition(textColumn as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The row centres its children, which is what keeps the marker level with
    // the middle of a two-line block.
    expect(marker.parentElement?.className).toContain('items-center');
  });

  it('keeps the marker while the title is being renamed', () => {
    // Renaming swaps the title for an input. A marker that lived inside the
    // title branch would vanish for as long as the field is open, which is
    // exactly when the user is looking at that row.
    mockActivity = { b: SessionActivity.Running };
    renderList([session('b', 'working one')]);

    fireEvent.mouseEnter(screen.getByText('working one').closest('button')!);
    fireEvent.click(screen.getByTitle('Rename session'));

    expect(screen.getByRole('textbox')).toHaveValue('working one');
    const marker = screen.getByTestId('session-activity');
    expect(marker.dataset.activity).toBe(SessionActivity.Running);
  });

  it('leaves the project line alone while marking the title', () => {
    mockActivity = { b: SessionActivity.Running };
    renderList([session('b', 'working one', `${ROOT}/packages/battery`)]);

    const origin = screen.getByText('packages/battery');

    // The path line has exactly its own text in it and nothing else.
    expect(origin.childElementCount).toBe(0);
    expect(origin.textContent).toBe('packages/battery');
  });
});

/**
 * A closed session is one no tab is showing. It has no state to report, so its
 * row draws no marker rather than colouring one idle (issue #449).
 */
describe('SessionList — closed sessions', () => {
  it('draws no marker for a session no tab has open', () => {
    mockOpen = new Set();
    renderList([session('a', 'closed one')]);

    expect(screen.queryByTestId('session-activity')).not.toBeInTheDocument();
  });

  it('takes the marker\u2019s width with it, leaving no blank in its place', () => {
    // Closed rows are the common case, and a reserved blank indents every one
    // of them against nothing.
    mockOpen = new Set(['b']);
    renderList([session('a', 'closed one'), session('b', 'open one')]);

    const closedRow = screen.getByText('closed one').closest('button')!;
    const openRow = screen.getByText('open one').closest('button')!;

    // The open row leads with the marker; the closed row leads with its text.
    expect((openRow.firstElementChild as HTMLElement).dataset.testid).toBe('session-activity');
    expect(closedRow.firstElementChild).toBe(screen.getByText('closed one').parentElement);
  });

  it('marks a session the moment a tab opens it', () => {
    mockActivity = { b: SessionActivity.Running };
    mockOpen = new Set();
    const { rerender } = renderListReturning([session('b', 'working one')]);

    expect(screen.queryByTestId('session-activity')).not.toBeInTheDocument();

    mockOpen = new Set(['b']);
    rerender(listElement([session('b', 'working one')]));

    expect(screen.getByTestId('session-activity').dataset.activity).toBe(SessionActivity.Running);
  });
});

/**
 * The bar between the search box and the rows: counts behind a funnel, and the
 * one filter that narrows the list to what is not finished with the user.
 */
describe('SessionList — filter bar', () => {
  it('counts the open rows by state, and the closed ones as closed', () => {
    mockActivity = {
      b: SessionActivity.Running,
      c: SessionActivity.Awaiting,
      d: SessionActivity.Done,
      // A session that finished and then had its tab closed. Its row draws no
      // marker, so counting it under Completed would name a number the rows on
      // screen do not add up to.
      e: SessionActivity.Done,
    };
    mockOpen = new Set(['a', 'b', 'c', 'd']);
    renderList([
      session('a', 'idle one'),
      session('b', 'working one'),
      session('c', 'asking one'),
      session('d', 'finished one'),
      session('e', 'closed one'),
    ]);

    fireEvent.click(screen.getByTestId('session-filter-toggle'));

    const countOf = (testId: string) =>
      screen.getByTestId(testId).lastElementChild?.textContent;

    expect(countOf(`session-filter-status-${SessionActivity.Running}`)).toBe('1');
    expect(countOf(`session-filter-status-${SessionActivity.Awaiting}`)).toBe('1');
    expect(countOf(`session-filter-status-${SessionActivity.Done}`)).toBe('1');
    expect(countOf('session-filter-tab-open')).toBe('4');
    expect(countOf('session-filter-tab-closed')).toBe('1');
  });

  it('adds up the three states that are not finished with the user', () => {
    mockActivity = {
      b: SessionActivity.Running,
      c: SessionActivity.Awaiting,
      d: SessionActivity.Done,
    };
    mockOpen = new Set(['a', 'b', 'c', 'd']);
    renderList([
      session('a', 'idle one'),
      session('b', 'working one'),
      session('c', 'asking one'),
      session('d', 'finished one'),
    ]);

    expect(screen.getByTestId('session-active-filter').textContent).toContain('3');
  });

  it('narrows the list to exactly the rows that count as active', () => {
    mockActivity = { b: SessionActivity.Running, d: SessionActivity.Done };
    mockOpen = new Set(['a', 'b', 'd']);
    renderList([
      session('a', 'idle one'),
      session('b', 'working one'),
      session('d', 'finished one'),
      session('e', 'closed one'),
    ]);

    fireEvent.click(screen.getByTestId('session-active-filter'));

    expect(screen.getByText('working one')).toBeInTheDocument();
    expect(screen.getByText('finished one')).toBeInTheDocument();
    expect(screen.queryByText('idle one')).not.toBeInTheDocument();
    expect(screen.queryByText('closed one')).not.toBeInTheDocument();
  });

  it('says so rather than going blank when nothing is active', () => {
    mockOpen = new Set(['a']);
    renderList([session('a', 'idle one')]);

    fireEvent.click(screen.getByTestId('session-active-filter'));

    expect(screen.queryByText('idle one')).not.toBeInTheDocument();
    expect(screen.getByText('No session is waiting on you')).toBeInTheDocument();
  });

  it('shows the whole list again when the filter is turned back off', () => {
    mockOpen = new Set(['a']);
    renderList([session('a', 'idle one')]);
    const filter = screen.getByTestId('session-active-filter');

    fireEvent.click(filter);
    fireEvent.click(filter);

    expect(screen.getByText('idle one')).toBeInTheDocument();
  });

  it('gives both bar buttons the same height', () => {
    // One holds only icons and the other holds text, and text carries a
    // line-height the icons do not — left to size themselves the pair came out
    // visibly uneven.
    mockOpen = new Set(['a']);
    renderList([session('a', 'idle one')]);

    const funnel = screen.getByTestId('session-filter-toggle');
    const active = screen.getByTestId('session-active-filter');
    const heightOf = (el: HTMLElement) => el.className.match(/(?:^|\s)h-\S+/)?.[0].trim();

    expect(heightOf(funnel)).toBeTruthy();
    expect(heightOf(funnel)).toBe(heightOf(active));
  });

  it('keeps the counts behind the funnel until it is opened', () => {
    mockOpen = new Set(['a']);
    renderList([session('a', 'idle one')]);

    expect(screen.queryByTestId('session-filter-menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('session-filter-toggle'));
    expect(screen.getByTestId('session-filter-menu')).toBeInTheDocument();
  });
});

/**
 * Each row of the funnel menu is a filter as well as a count (issue #449).
 */
describe('SessionList — filter menu selections', () => {
  function openMenu() {
    fireEvent.click(screen.getByTestId('session-filter-toggle'));
  }

  it('narrows the list to one status when that status is picked', () => {
    mockActivity = { b: SessionActivity.Running, d: SessionActivity.Done };
    mockOpen = new Set(['a', 'b', 'd']);
    renderList([
      session('a', 'idle one'),
      session('b', 'working one'),
      session('d', 'finished one'),
    ]);

    openMenu();
    fireEvent.click(screen.getByTestId(`session-filter-status-${SessionActivity.Running}`));

    expect(screen.getByText('working one')).toBeInTheDocument();
    expect(screen.queryByText('finished one')).not.toBeInTheDocument();
    expect(screen.queryByText('idle one')).not.toBeInTheDocument();
  });

  it('widens to the union when a second status is picked', () => {
    mockActivity = { b: SessionActivity.Running, d: SessionActivity.Done };
    mockOpen = new Set(['a', 'b', 'd']);
    renderList([
      session('a', 'idle one'),
      session('b', 'working one'),
      session('d', 'finished one'),
    ]);

    openMenu();
    fireEvent.click(screen.getByTestId(`session-filter-status-${SessionActivity.Running}`));
    fireEvent.click(screen.getByTestId(`session-filter-status-${SessionActivity.Done}`));

    expect(screen.getByText('working one')).toBeInTheDocument();
    expect(screen.getByText('finished one')).toBeInTheDocument();
    expect(screen.queryByText('idle one')).not.toBeInTheDocument();
  });

  it('shows the whole list again once the last status is unpicked', () => {
    // An empty selection is "no opinion", not "nothing" — otherwise turning the
    // last one off would leave the list blank.
    mockActivity = { b: SessionActivity.Running };
    mockOpen = new Set(['a', 'b']);
    renderList([session('a', 'idle one'), session('b', 'working one')]);

    openMenu();
    const running = screen.getByTestId(`session-filter-status-${SessionActivity.Running}`);
    fireEvent.click(running);
    fireEvent.click(running);

    expect(screen.getByText('idle one')).toBeInTheDocument();
    expect(screen.getByText('working one')).toBeInTheDocument();
  });

  it('ticks the rows that are picked', () => {
    mockOpen = new Set(['a']);
    renderList([session('a', 'idle one')]);

    openMenu();
    const open = screen.getByTestId('session-filter-tab-open');
    expect(open.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(open);
    expect(screen.getByTestId('session-filter-tab-open').getAttribute('aria-checked')).toBe('true');
  });

  it('filters by whether a tab has the session open', () => {
    mockOpen = new Set(['a']);
    renderList([session('a', 'open one'), session('b', 'closed one')]);

    openMenu();
    fireEvent.click(screen.getByTestId('session-filter-tab-closed'));

    expect(screen.getByText('closed one')).toBeInTheDocument();
    expect(screen.queryByText('open one')).not.toBeInTheDocument();
  });

  it('stays open while filters are being picked', () => {
    // Picking several filters is one action from the user's side; a menu that
    // shut after each pick would make it three trips.
    mockActivity = { b: SessionActivity.Running };
    mockOpen = new Set(['a', 'b']);
    renderList([session('a', 'idle one'), session('b', 'working one')]);

    openMenu();
    fireEvent.click(screen.getByTestId(`session-filter-status-${SessionActivity.Running}`));
    expect(screen.getByTestId('session-filter-menu')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('session-filter-tab-open'));
    expect(screen.getByTestId('session-filter-menu')).toBeInTheDocument();
  });

  it('never lets a closed session satisfy a status filter', () => {
    // It draws no marker, so a status filter matching it would put a row on
    // screen with nothing to show for why it is there.
    mockActivity = { b: SessionActivity.Done };
    mockOpen = new Set();
    renderList([session('b', 'closed but finished')]);

    openMenu();
    fireEvent.click(screen.getByTestId(`session-filter-status-${SessionActivity.Done}`));

    expect(screen.queryByText('closed but finished')).not.toBeInTheDocument();
  });

  it('requires every filter that is set to pass', () => {
    mockActivity = { a: SessionActivity.Running, b: SessionActivity.Running };
    mockOpen = new Set(['a']);
    renderList([session('a', 'open and working'), session('b', 'closed and working')]);

    openMenu();
    fireEvent.click(screen.getByTestId(`session-filter-status-${SessionActivity.Running}`));
    fireEvent.click(screen.getByTestId('session-filter-tab-open'));

    expect(screen.getByText('open and working')).toBeInTheDocument();
    expect(screen.queryByText('closed and working')).not.toBeInTheDocument();
  });
});
