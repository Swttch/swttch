import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useBridgeContext } from './BridgeContext';
import { useSessionContext } from './SessionContext';
import { useSettingsOrNull } from './SettingsContext';
import { SettingKey, type RunViewPlacement } from '@/types/settings';
import { useNavigate } from 'react-router-dom';
import { getAdapter } from '@/adapters';
import { runToPath, withWorkingDir } from '@/router';
import { MessageType } from '@/shared';
import type { WorkflowTask } from '@/shared';

interface WorkflowStateValue {
  /** All known workflows for the current session (running + finished). */
  tasks: WorkflowTask[];
  getByToolUseId: (toolUseId: string) => WorkflowTask | undefined;
  runningTasks: WorkflowTask[];
  finishedTasks: WorkflowTask[];
  /** Hide finished workflows from the panel (the "Clear" action). The inline
   *  chat cards keep their last status — only the panel list is affected. */
  clearFinished: () => void;
  /** Hide a single workflow from the panel by tool_use id (the per-row "✕").
   *  The inline chat card keeps its status; this only removes it from the
   *  Background tasks list. */
  dismissTask: (toolUseId: string) => void;
  // Background tasks panel UI state
  panelOpen: boolean;
  /** Open the panel; pass a toolUseId to scroll/highlight that workflow. */
  openPanel: (toolUseId?: string) => void;
  closePanel: () => void;
  focusedToolUseId: string | null;
  /**
   * The task whose run window (AgentTranscriptModal) is open, by tool_use id.
   * Held here rather than in the panel so a card in the chat can open the
   * window directly, with the panel closed (#673).
   */
  transcriptToolUseId: string | null;
  openTranscript: (toolUseId: string) => void;
  closeTranscript: () => void;
  /**
   * The subagent whose run is shown inside the Background tasks panel, in place of its list (#667). `null` is the
   * list. Closing the panel or changing session puts it back to the list.
   */
  sideRunToolUseId: string | null;
  /** Opens the panel on this subagent's run. */
  openRunInSide: (toolUseId: string) => void;
  /** Back to the panel's list. */
  closeRunInSide: () => void;
  /**
   * The way into a task's run from a line in the chat or the list: a subagent opens in the panel beside the chat,
   * anything else (a workflow, a command) in the window over it.
   */
  openRun: (toolUseId: string) => void;
  /**
   * Show a task's run in one of the four places a run can be: beside the chat, over it, as a page of this tab, or in
   * a tab of its own. The view options menu's place picker and the pin both end here, so a place means the same
   * wherever it is picked from.
   */
  placeRun: (toolUseId: string, placement: RunViewPlacement) => void;
  /**
   * The tasks whose end this screen saw happen: heard running, then heard over. The CLI does not write the notice of
   * a task's end into the chat until the session is read again, so the chat draws it from these (a task read back
   * already over is not here: its notice is in the record).
   */
  liveEndedIds?: ReadonlySet<string>;
}

const WorkflowStateContext = createContext<WorkflowStateValue | null>(null);

/**
 * Holds live dynamic-workflow progress streamed from the backend via
 * WORKFLOW_PROGRESS. Keyed by the Workflow tool_use id so the inline card and
 * the Background tasks panel read the same source. Resets on session change.
 */
export function WorkflowStateProvider({ children }: { children: ReactNode }) {
  const { subscribe, isConnected } = useBridgeContext();
  const { currentSessionId } = useSessionContext();
  const navigate = useNavigate();
  const [taskMap, setTaskMap] = useState<Map<string, WorkflowTask>>(new Map());
  // Workflows hidden from the panel via "Clear"/"✕". They stay in taskMap so the
  // inline chat card keeps rendering its real status — dismissing must not make
  // getByToolUseId return undefined (which would fall back to "running").
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusedToolUseId, setFocusedToolUseId] = useState<string | null>(null);
  const [transcriptToolUseId, setTranscriptToolUseId] = useState<string | null>(null);
  const [sideRunToolUseId, setSideRunToolUseId] = useState<string | null>(null);
  const heardRunningRef = useRef<Set<string>>(new Set());
  const [liveEndedIds, setLiveEndedIds] = useState<ReadonlySet<string>>(new Set());

  // currentSessionId is derived from the URL (SSOT) — clear when it changes.
  useEffect(() => {
    setTaskMap(new Map());
    heardRunningRef.current = new Set();
    setLiveEndedIds(new Set());
    setDismissedIds(new Set());
    setPanelOpen(false);
    setFocusedToolUseId(null);
    setTranscriptToolUseId(null);
    setSideRunToolUseId(null);
  }, [currentSessionId]);

  const openPanel = useCallback((toolUseId?: string) => {
    setFocusedToolUseId(toolUseId ?? null);
    setPanelOpen(true);
  }, []);
  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setSideRunToolUseId(null);
  }, []);
  const openRunInSide = useCallback((toolUseId: string) => {
    setFocusedToolUseId(toolUseId);
    setSideRunToolUseId(toolUseId);
    setPanelOpen(true);
  }, []);
  const closeRunInSide = useCallback(() => setSideRunToolUseId(null), []);
  const openTranscript = useCallback((toolUseId: string) => setTranscriptToolUseId(toolUseId), []);
  const closeTranscript = useCallback(() => setTranscriptToolUseId(null), []);
  // Where a run opens when it is clicked: the place pinned as the default for the project (the view options menu's
  // pin), else beside the chat.
  const pinnedPlacement = useSettingsOrNull()?.settings[SettingKey.RUN_VIEW_PLACEMENT] ?? null;
  const placeRun = useCallback(
    (toolUseId: string, placement: RunViewPlacement) => {
      switch (placement) {
        case 'center':
          openTranscript(toolUseId);
          return;
        case 'tab':
        case 'page': {
          // The page is of the session that started the task, so with no session (a conversation not begun) there is
          // nothing to address it by and the run stays beside the chat.
          if (!currentSessionId) {
            openRunInSide(toolUseId);
            return;
          }
          const path = runToPath(currentSessionId, toolUseId);
          if (placement === 'page') {
            // The same tab moves to the page. The place goes along so the page can say where it is.
            navigate(withWorkingDir(path), { state: { runPlacement: 'page' } });
            return;
          }
          getAdapter()
            .openTab(path)
            .catch((error) => {
              // A blocked pop-up or an IDE that cannot be reached must not swallow the click: beside the chat still
              // shows the run.
              console.warn('[WorkflowState] opening the run in a tab failed, showing it beside the chat:', error);
              openRunInSide(toolUseId);
            });
          return;
        }
        default:
          openRunInSide(toolUseId);
      }
    },
    [currentSessionId, navigate, openRunInSide, openTranscript],
  );
  const openRun = useCallback(
    (toolUseId: string) => {
      // A task this screen has not heard of has no run to put anywhere but the window.
      if (!taskMap.has(toolUseId)) openTranscript(toolUseId);
      else placeRun(toolUseId, pinnedPlacement ?? 'side');
    },
    [taskMap, placeRun, openTranscript, pinnedPlacement],
  );

  useEffect(() => {
    if (!isConnected) return;
    return subscribe(MessageType.WORKFLOW_PROGRESS, (message) => {
      const task = message.payload as unknown as WorkflowTask;
      if (!task?.toolUseId) return;
      if (task.status === 'running') {
        heardRunningRef.current.add(task.toolUseId);
      } else if (heardRunningRef.current.has(task.toolUseId)) {
        setLiveEndedIds((prev) => (prev.has(task.toolUseId) ? prev : new Set(prev).add(task.toolUseId)));
      }
      setTaskMap((prev) => {
        const next = new Map(prev);
        next.set(task.toolUseId, task);
        return next;
      });
    });
  }, [isConnected, subscribe]);

  const value = useMemo<WorkflowStateValue>(() => {
    // The newest first, as the desktop app lists them: a task still running by when it started, a finished one by
    // when it ended (the one that took longest, of tasks started together, is above the others), and a finished
    // task with no end by its start. The map holds them in the order they were first heard of (oldest first after
    // a reload, which replays the record from its start), so that order is reversed to break ties, and a task
    // with no times (one rebuilt after a reload) is taken to be older than any that has one.
    const sortKey = (task: WorkflowTask): number =>
      Math.max(task.status === 'running' ? task.startedAt : (task.endedAt ?? task.startedAt), 0);
    const newestFirst = (list: WorkflowTask[]): WorkflowTask[] =>
      list
        .map((task, arrival) => ({ task, arrival }))
        .sort((a, b) => sortKey(b.task) - sortKey(a.task) || b.arrival - a.arrival)
        .map(({ task }) => task);
    const all = Array.from(taskMap.values());
    const tasks = [...newestFirst(all.filter((t) => t.status === 'running')), ...newestFirst(all.filter((t) => t.status !== 'running'))];
    // Panel lists exclude dismissed workflows; getByToolUseId (inline card) does
    // not — the card must always reflect the workflow's real status.
    const visible = tasks.filter((t) => !dismissedIds.has(t.toolUseId));
    return {
      tasks: visible,
      getByToolUseId: (id) => taskMap.get(id),
      runningTasks: visible.filter((t) => t.status === 'running'),
      finishedTasks: visible.filter((t) => t.status !== 'running'),
      clearFinished: () =>
        setDismissedIds((prev) => {
          const next = new Set(prev);
          for (const t of taskMap.values()) if (t.status !== 'running') next.add(t.toolUseId);
          return next;
        }),
      dismissTask: (id) =>
        setDismissedIds((prev) => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          return next;
        }),
      panelOpen,
      openPanel,
      closePanel,
      focusedToolUseId,
      transcriptToolUseId,
      openTranscript,
      closeTranscript,
      sideRunToolUseId,
      openRunInSide,
      closeRunInSide,
      openRun,
      placeRun,
      liveEndedIds,
    };
  }, [sideRunToolUseId, openRunInSide, closeRunInSide, openRun, placeRun, liveEndedIds, taskMap, dismissedIds, panelOpen, openPanel, closePanel, focusedToolUseId, transcriptToolUseId, openTranscript, closeTranscript]);

  return <WorkflowStateContext.Provider value={value}>{children}</WorkflowStateContext.Provider>;
}

/**
 * Like `useWorkflowState`, but null where there is no provider: for a card that
 * offers a way into a task's run window only when that window can be opened.
 */
export function useOptionalWorkflowState(): WorkflowStateValue | null {
  return useContext(WorkflowStateContext);
}

export function useWorkflowState(): WorkflowStateValue {
  const ctx = useContext(WorkflowStateContext);
  if (!ctx) throw new Error('useWorkflowState must be used within a WorkflowStateProvider');
  return ctx;
}
