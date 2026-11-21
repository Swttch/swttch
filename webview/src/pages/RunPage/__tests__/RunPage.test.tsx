import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { WorkflowTask } from '@/shared';

// The three views are stubbed: what is asked of the page is which one it draws and what it hands them.
type ViewProps = {
  surface: string;
  placement: string;
  onBack: () => void;
  onPlacementChange: (placement: string) => void;
  onOpenInNewTab?: () => void;
  variant?: string;
};
const { view } = vi.hoisted(() => ({
  view: (id: string) => (p: ViewProps) => (
    <div data-testid={id}>
      <span data-testid="variant">{p.variant}</span>
      <span data-testid="surface">{`${p.surface}/${p.placement}`}</span>
      <button data-testid="back" onClick={p.onBack} />
      <button data-testid="to-side" onClick={() => p.onPlacementChange('side')} />
      <button data-testid="to-tab" onClick={() => p.onPlacementChange('tab')} />
      {p.onOpenInNewTab && <button data-testid="new-tab" onClick={p.onOpenInNewTab} />}
    </div>
  ),
}));
vi.mock('@/components/AgentTranscriptModal/SubagentRunView', () => ({ SubagentRunView: view('agent-view') }));
vi.mock('@/components/AgentTranscriptModal/WorkflowRunView', () => ({ WorkflowRunView: view('workflow-view') }));
vi.mock('@/components/AgentTranscriptModal/BashRunView', () => ({ BashRunView: view('bash-view') }));

const mockOpenTab = vi.fn();
vi.mock('@/adapters', () => ({ getAdapter: () => ({ openTab: mockOpenTab }) }));

let sessionLoaded: ((message: { payload: unknown }) => void) | null = null;
vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    subscribe: (_type: string, cb: (message: { payload: unknown }) => void) => {
      sessionLoaded = cb;
      return () => undefined;
    },
  }),
}));

let mockTask: WorkflowTask | undefined;
const mockPlaceRun = vi.fn();
vi.mock('@/contexts/WorkflowStateContext', () => ({
  useWorkflowState: () => ({ getByToolUseId: () => mockTask, placeRun: mockPlaceRun }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { RunPage } from '..';

const task = (over: Partial<WorkflowTask> = {}) =>
  ({ toolUseId: 'toolu_1', name: 'Explore the repo', taskType: 'local_agent', status: 'running', ...over }) as unknown as WorkflowTask;

function renderPage(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/runs/sess-1/toolu_1', state }]}>
      <Routes>
        <Route path="/runs/:session_id/:tool_use_id" element={<RunPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockTask = undefined;
  sessionLoaded = null;
  mockOpenTab.mockReset().mockResolvedValue(undefined);
  mockNavigate.mockReset();
  mockPlaceRun.mockReset();
  document.title = 'before';
});

describe('RunPage', () => {
  it('waits for the task while the session is being read, then draws it in the page form', () => {
    const { rerender } = renderPage();
    expect(screen.getByText('backgroundTasks.runPage.loading')).toBeTruthy();

    mockTask = task();
    rerender(
      <MemoryRouter initialEntries={['/runs/sess-1/toolu_1']}>
        <Routes>
          <Route path="/runs/:session_id/:tool_use_id" element={<RunPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('agent-view')).toBeTruthy();
    expect(screen.getByTestId('surface').textContent).toBe('page/tab');
  });

  it('says so once the session has been read and the task is still not in it', () => {
    vi.useFakeTimers();
    try {
      renderPage();
      act(() => sessionLoaded?.({ payload: { sessionId: 'sess-1' } }));
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByText('backgroundTasks.runPage.notFound')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('draws each kind of task with its own view', () => {
    for (const [taskType, id] of [
      ['local_agent', 'agent-view'],
      ['local_bash', 'bash-view'],
      ['local_workflow', 'workflow-view'],
    ] as const) {
      mockTask = task({ taskType });
      const { unmount } = renderPage();
      expect(screen.getByTestId(id)).toBeTruthy();
      unmount();
    }
  });

  it('names the tab after the task', () => {
    mockTask = task();
    renderPage();
    expect(document.title).toBe('Explore the repo');
  });

  it('keeps drawing a stopped task, with no bar of its own above the title', () => {
    mockTask = task({ status: 'stopped' });
    renderPage();
    expect(screen.queryByText('backgroundTasks.runPage.ended')).toBeNull();
    expect(screen.getByTestId('agent-view')).toBeTruthy();
  });

  it('is drawn as a page, in the same compact form as the side panel', () => {
    mockTask = task();
    renderPage();
    expect(screen.getByTestId('surface').textContent?.startsWith('page/')).toBe(true);
  });

  it('goes back with the router when something led to the page', () => {
    mockTask = task();
    render(
      <MemoryRouter initialEntries={['/sessions/sess-1', '/runs/sess-1/toolu_1']} initialIndex={1}>
        <Routes>
          <Route path="/runs/:session_id/:tool_use_id" element={<RunPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('back'));

    expect(mockNavigate).toHaveBeenCalledWith(-1);
    expect(mockOpenTab).not.toHaveBeenCalled();
  });

  it('with nothing to go back to, in a tab of its own, goes back to the tab already showing the session instead of becoming a copy of it', () => {
    mockTask = task();
    renderPage();
    fireEvent.click(screen.getByTestId('back'));

    expect(mockOpenTab).toHaveBeenCalledWith('/sessions/sess-1');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('as the page of the current tab, goes back by moving the tab, and can open itself in a tab', () => {
    mockTask = task();
    renderPage({ runPlacement: 'page' });
    expect(screen.getByTestId('surface').textContent).toBe('page/page');

    fireEvent.click(screen.getByTestId('back'));
    expect(mockNavigate).toHaveBeenCalledWith('/sessions/sess-1');

    fireEvent.click(screen.getByTestId('new-tab'));
    expect(mockOpenTab).toHaveBeenCalledWith('/runs/sess-1/toolu_1');
  });

  it('shows the same controls as the window whether it is a tab or the page of the current tab', () => {
    mockTask = task();
    renderPage();
    expect(screen.getByTestId('new-tab')).toBeTruthy();
  });

  it('starts in the short view, like the window and the side panel', () => {
    mockTask = task();
    renderPage();
    expect(screen.getByTestId('variant').textContent).toBe('simple');
  });

  it('puts the run beside the chat by going back to the session and showing it there', () => {
    mockTask = task();
    renderPage();
    fireEvent.click(screen.getByTestId('to-side'));

    expect(mockNavigate).toHaveBeenCalledWith('/sessions/sess-1');
    expect(mockPlaceRun).toHaveBeenCalledWith('toolu_1', 'side');
  });
});
