import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useFormatElapsed } from '../transcript/TranscriptActivity';
import { Tooltip } from '@/components/Tooltip';
import { Portal } from '@/components/Portal';
import { useWorkflowState } from '@/contexts/WorkflowStateContext';
import { useBackgroundTaskActions } from '@/hooks/useBackgroundTaskActions';
import { useNow } from '@/hooks/useNow';
import type { WorkflowTask } from '@/shared';
import { useTranslation } from '@/i18n';
import { AgentTranscriptModal } from '@/components/AgentTranscriptModal';
import { SIDE_PANEL_HEADER_CLASS, type RunVariant } from '@/components/AgentTranscriptModal/RunViewControls';
import { SideRun } from './SideRun';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';
import { maxTaskPanelWidth, taskPanelWidthStore, useTaskPanelColumn, useTaskPanelWidthCss } from './useTaskPanelColumn';
import { taskDurationMs } from './WorkflowTaskSummary';
import { WorkflowCard } from './WorkflowCard';
import { TaskTypeIcon } from './TaskTypeIcon';
import { DismissButton } from './DismissButton';
import { StopButton } from './StopButton';
import { formatTokensFor, workflowTokens } from '@/utils/workflowFormat';

/**
 * An agent in the list, as the desktop app draws it: one line with its name and a way in, and at the right how long it
 * took, or that it was stopped or failed. A running agent has the time it has run and a button to stop it.
 */
function AgentTaskRow({
    task,
    now,
    focused,
    onCancel,
    onDismiss,
    onOpenTranscript,
    command = false,
}: {
    task: WorkflowTask;
    now: number;
    focused: boolean;
    onCancel: (task: WorkflowTask) => void;
    onDismiss: (toolUseId: string) => void;
    onOpenTranscript: (task: WorkflowTask) => void;
    /** A command is the same line with another icon and no tokens. */
    command?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const { t, i18n } = useTranslation('chat');
    const formatElapsed = useFormatElapsed();
    useEffect(() => {
        if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [focused]);

    const ms = taskDurationMs(task, now);
    const elapsed = ms === undefined ? '' : formatElapsed(Math.max(0, Math.round(ms / 1000)));
    // Where the time is known it is shown with the status, at the right of it (the desktop app shows the status alone).
    const status =
        task.status === 'stopped' ? t('backgroundTasks.statusStopped')
        : task.status === 'failed' ? <span className="text-state-error-fg">{t('backgroundTasks.statusFailed')}</span>
        : null;
    // The status and the time are two things: a dot between them says so.
    const right = (
        <>
            {status}
            {status && elapsed ? ' · ' : ''}
            {elapsed}
        </>
    );
    const tokenCount = formatTokensFor(
        i18n.language,
        workflowTokens(task.usage) || task.agents.reduce((sum, a) => sum + (a.tokens || 0), 0),
    );

    return (
        <div
            ref={ref}
            onClick={() => onOpenTranscript(task)}
            data-testid="agent-task-row"
            className={`group flex items-center gap-2 rounded-[11px] border bg-surface-hover px-[0.83rem] py-[0.775rem] cursor-pointer hover:bg-surface-pressed transition-colors ${
                focused ? 'border-border-focus' : 'border-transparent'
            }`}
        >
            <div className="flex min-w-0 items-center gap-1.5 text-text-primary text-[0.9230rem]">
                <TaskTypeIcon kind={command ? 'command' : 'agent'} />
                <Tooltip content={task.name} placement="top">
                    <span className="truncate">{task.name}</span>
                </Tooltip>
                <ChevronRightIcon className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary rtl:-scale-x-100" />
                {!command && tokenCount && (
                    <span className="ms-1 flex-shrink-0 whitespace-nowrap text-[0.8461rem] text-text-secondary">
                        {t('backgroundTasks.tokensLabel', { tokens: tokenCount })}
                    </span>
                )}
            </div>
            <div className="ms-auto flex-shrink-0 text-[0.8461rem] text-text-secondary">{right}</div>
            {task.status !== 'running' && <DismissButton task={task} onDismiss={onDismiss} />}
            {task.status === 'running' && <StopButton task={task} onCancel={onCancel} />}
        </div>
    );
}

/** An agent or a command is one compact line; a workflow is a card with its phases. */
function TaskRow(props: React.ComponentProps<typeof AgentTaskRow>) {
    switch (props.task.taskType) {
        case 'local_agent':
            return <AgentTaskRow {...props} />;
        case 'local_bash':
            return <AgentTaskRow {...props} command />;
        default:
            return <WorkflowCard {...props} />;
    }
}

export function BackgroundTasksPanel() {
    const { t } = useTranslation('chat');
    const {
        panelOpen, closePanel, runningTasks, finishedTasks, clearFinished, dismissTask, focusedToolUseId, getByToolUseId,
        transcriptToolUseId, closeTranscript, sideRunToolUseId, closeRunInSide, openRun, placeRun,
    } = useWorkflowState();
    const [showFinished, setShowFinished] = useState(true);
    // A run in the panel opens to the short view, like the window does; the word button flips it.
    const [sideVariant, setSideVariant] = useState<RunVariant>('simple');
    // Only the id is kept (in the shared state, so a card in the chat can open
    // the window too), and the task is looked up again each render: the modal
    // keeps showing the live WorkflowTask (updated agents/stats) as the workflow
    // progresses instead of a frozen snapshot taken at click time (issue #347).
    const transcriptTask = transcriptToolUseId ? getByToolUseId(transcriptToolUseId) ?? null : null;
    // A subagent opened from the chat or the list takes the panel's place in it, with a way back to the list.
    const sideTask = sideRunToolUseId ? getByToolUseId(sideRunToolUseId) ?? null : null;
    // The run is gone from the list (dismissed, or a different session): nothing to show, so the list is shown.
    useEffect(() => {
        if (sideRunToolUseId && !sideTask) closeRunInSide();
    }, [sideRunToolUseId, sideTask, closeRunInSide]);
    const panelRef = useRef<HTMLDivElement>(null);
    const now = useNow(panelOpen && runningTasks.length > 0);

    const { cancelTask } = useBackgroundTaskActions();
    // Beside the chat the panel is a column of its own: the chat stays usable, so a click in it must not
    // close the panel and focus stays where it was. Narrower, it floats over the chat and does both.
    const column = useTaskPanelColumn();
    const columnWidth = useTaskPanelWidthCss();
    const drag = useRef<{ startX: number; startWidth: number } | null>(null);

    // Only one side panel at a time: opening this one closes the preview pane, and opening the preview
    // pane while this one is open closes this one.
    useEffect(() => {
        if (!panelOpen) return;
        filePreviewPaneStore.close();
        return filePreviewPaneStore.subscribe(() => {
            if (filePreviewPaneStore.get() !== null) closePanel();
        });
    }, [panelOpen, closePanel]);

    // When the panel opens, move focus into it so keystrokes (notably Escape)
    // act on the panel — closing it — instead of the chat input behind it. On
    // close, restore focus to wherever it was (e.g. the chat input).
    useEffect(() => {
        if (!panelOpen || column) return;
        const prevFocus = document.activeElement as HTMLElement | null;
        panelRef.current?.focus();
        return () => prevFocus?.focus?.();
    }, [panelOpen, column]);

    // Click anywhere outside the panel closes it, matching the transcript
    // modal's own outside-click behavior below. Skipped while that modal is
    // open: it renders as a sibling (via the same Portal), so a click inside
    // it — e.g. its "Cancel this task" button — is technically "outside
    // panelRef" too, and would otherwise close the panel (unmounting the
    // modal along with it, since it's this component's own child). The modal
    // already owns outside-click-to-close for itself while it's up.
    // `mousedown`, not `click`: a drag that starts inside the panel and ends
    // outside — e.g. selecting a row's prompt text — must not count.
    useEffect(() => {
        if (!panelOpen || column || transcriptToolUseId) return;
        const handleMouseDown = (e: MouseEvent) => {
            // The menus of the run view's title row (the More dropdown and the view options beside it) are drawn into
            // <body>, outside the panel, yet are part of it: a press on one of their rows must not close the panel
            // before the click lands, or the row's action (opening the run in the window) would never happen.
            if ((e.target as Element).closest?.('[data-tippy-root], [role="menu"]')) return;
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                closePanel();
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [panelOpen, column, transcriptToolUseId, closePanel]);

    // The run window can be open with the panel shut (opened from a card in the
    // chat), so it is drawn on its own in that case.
    if (!panelOpen) {
        return transcriptTask ? (
            <Portal>
                <AgentTranscriptModal task={transcriptTask} onClose={closeTranscript} />
            </Portal>
        ) : null;
    }

    return (
        <Portal>
            <div
                ref={panelRef}
                tabIndex={-1}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        e.stopPropagation();
                        // One layer at a time: out of a run to the list, then out of the list.
                        if (sideTask) closeRunInSide();
                        else closePanel();
                    }
                }}
                // Beside the chat it takes a column (no shadow, nothing under it); over it, it keeps its shadow.
                className={`fixed end-0 top-0 bottom-0 z-40 flex flex-col bg-surface-raised border-s border-border-default outline-none ${
                    column ? '' : 'max-w-[92vw] shadow-2xl'
                }`}
                style={{ width: column ? columnWidth : '24rem' }}
            >
                {column && (
                    // The handle on the panel's start edge: drag it to widen or narrow the panel, double-click to put it back.
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={t('filePreview.resize')}
                        className="group/resize absolute inset-y-0 start-0 z-10 w-[calc(8px/var(--ui-zoom,1))] -translate-x-1/2 cursor-col-resize touch-none rtl:translate-x-1/2"
                        onPointerDown={(e) => {
                            e.preventDefault();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            // In screen pixels: the pointer reports them, and the stored width is kept in them too.
                            const rect = panelRef.current?.getBoundingClientRect();
                            drag.current = { startX: e.clientX, startWidth: rect?.width ?? 0 };
                        }}
                        onPointerMove={(e) => {
                            const start = drag.current;
                            if (!start || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
                            const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
                            const delta = rtl ? e.clientX - start.startX : start.startX - e.clientX;
                            const next = start.startWidth + delta;
                            taskPanelWidthStore.set(Math.min(maxTaskPanelWidth(window.innerWidth), next));
                        }}
                        onPointerUp={(e) => {
                            drag.current = null;
                            e.currentTarget.releasePointerCapture(e.pointerId);
                        }}
                        onDoubleClick={() => taskPanelWidthStore.set(null)}
                    >
                        <div className="absolute start-1/2 top-1/2 h-[calc(42px/var(--ui-zoom,1))] w-[calc(3px/var(--ui-zoom,1))] -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent transition-colors group-hover/resize:bg-text-primary/35 group-active/resize:bg-text-primary/50" />
                    </div>
                )}
                {sideTask ? (
                    <SideRun
                        task={sideTask}
                        variant={sideVariant}
                        onVariantChange={setSideVariant}
                        onBack={closeRunInSide}
                        backLabel={t('backgroundTasks.title')}
                        onClose={closePanel}
                        // This is the "side" placement; picking any other moves the run there and takes it off the panel.
                        onPlacementChange={(placement) => {
                            if (placement === 'side') return;
                            closeRunInSide();
                            placeRun(sideTask.toolUseId, placement);
                        }}
                        // A tab of its own is another view of the run, so the panel keeps showing it.
                        onOpenInNewTab={() => placeRun(sideTask.toolUseId, 'tab')}
                    />
                ) : (
                    <>
                <div className={`${SIDE_PANEL_HEADER_CLASS} border-b border-border-subtle`}>
                    <div className="text-text-primary text-[1rem] font-semibold">{t('backgroundTasks.title')}</div>
                    <div className="flex items-center gap-1">
                        {/* As the desktop app has it: clearing what is finished is an icon in the header, beside close. */}
                        {finishedTasks.length > 0 && (
                            <Tooltip content={t('backgroundTasks.clearFinished')} placement="bottom">
                                <button
                                    onClick={clearFinished}
                                    aria-label={t('backgroundTasks.clearFinished')}
                                    className="p-1 rounded hover:bg-surface-hover transition-colors"
                                >
                                    <TrashIcon className="w-5 h-5 text-text-secondary" />
                                </button>
                            </Tooltip>
                        )}
                        <button
                            onClick={closePanel}
                            className="p-1 rounded hover:bg-surface-hover transition-colors"
                            title={t('backgroundTasks.close')}
                        >
                            <XMarkIcon className="w-5 h-5 text-text-secondary" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-4">
                    {runningTasks.length === 0 && finishedTasks.length === 0 && (
                        <div className="text-text-primary/50 text-[0.9230rem] text-center mt-8">
                            {t('backgroundTasks.empty')}
                        </div>
                    )}

                    {runningTasks.length > 0 && (
                        <section className="space-y-[0.556rem]">
                            <div className="px-1 text-[0.9230rem] text-text-tertiary">{t('backgroundTasks.running')} {runningTasks.length}</div>
                            {runningTasks.map((task) => (
                                <TaskRow
                                    key={task.toolUseId}
                                    task={task}
                                    now={now}
                                    focused={task.toolUseId === focusedToolUseId}
                                    onCancel={cancelTask}
                                    onDismiss={dismissTask}
                                    onOpenTranscript={(t) => openRun(t.toolUseId)}
                                />
                            ))}
                        </section>
                    )}

                    {finishedTasks.length > 0 && (
                        <section className="space-y-[0.556rem]">
                            <button
                                onClick={() => setShowFinished((v) => !v)}
                                aria-expanded={showFinished}
                                className="flex items-center gap-1.5 px-1 text-[0.9230rem] text-text-tertiary hover:text-text-secondary transition-colors"
                            >
                                <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${showFinished ? '' : '-rotate-90 rtl:rotate-90'}`} />
                                {t('backgroundTasks.finishedCount', { count: finishedTasks.length })}
                            </button>
                            {showFinished &&
                                finishedTasks.map((task) => (
                                    <TaskRow
                                        key={task.toolUseId}
                                        task={task}
                                        now={now}
                                        focused={task.toolUseId === focusedToolUseId}
                                        onCancel={cancelTask}
                                    onDismiss={dismissTask}
                                    onOpenTranscript={(t) => openRun(t.toolUseId)}
                                    />
                                ))}
                        </section>
                    )}
                </div>
                    </>
                )}
            </div>

            {transcriptTask && (
                <AgentTranscriptModal task={transcriptTask} onClose={closeTranscript} />
            )}
        </Portal>
    );
}
