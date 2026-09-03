import { useEffect, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Portal } from '@/components/Portal';
import { useWorkflowState } from '@/contexts/WorkflowStateContext';
import { useBackgroundTaskActions } from '@/hooks/useBackgroundTaskActions';
import { useNow } from '@/hooks/useNow';
import type { WorkflowTask } from '@/shared';
import { useTranslation } from '@/i18n';
import { AgentTranscriptModal } from '@/components/AgentTranscriptModal';
import { WorkflowTaskSummary, WorkflowAgentsTable } from './WorkflowTaskSummary';

function WorkflowTaskRow({
    task,
    now,
    focused,
    onDismiss,
    onCancel,
    onOpenTranscript,
}: {
    task: WorkflowTask;
    now: number;
    focused: boolean;
    onDismiss: (toolUseId: string) => void;
    onCancel: (task: WorkflowTask) => void;
    onOpenTranscript: (task: WorkflowTask) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const { t } = useTranslation('chat');
    useEffect(() => {
        if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [focused]);

    const isRunning = task.status === 'running';

    return (
        <div
            ref={ref}
            onClick={() => onOpenTranscript(task)}
            className={`rounded-lg border bg-surface-base px-3 py-2.5 cursor-pointer hover:border-border-focus transition-colors ${
                focused ? 'border-border-focus' : 'border-border-subtle'
            }`}
        >
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 text-text-primary text-[0.9230rem] font-semibold truncate">
                    {task.name}
                </div>
                {/* Running: cancel the task (issue #330). Finished: it is over,
                    so the same ✕ only takes the row out of the list. stopPropagation
                    keeps this from also opening the transcript modal (issue #347). */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        isRunning ? onCancel(task) : onDismiss(task.toolUseId);
                    }}
                    className="shrink-0 p-0.5 rounded hover:bg-surface-hover transition-colors"
                    title={isRunning ? t('backgroundTasks.cancelRunning') : t('backgroundTasks.dismiss')}
                >
                    <XMarkIcon className="w-3.5 h-3.5 text-text-tertiary hover:text-text-secondary" />
                </button>
            </div>

            <div className="mt-0.5">
                <WorkflowTaskSummary task={task} now={now} />
            </div>

            <WorkflowAgentsTable task={task} />
        </div>
    );
}

export function BackgroundTasksPanel() {
    const { t } = useTranslation('chat');
    const { panelOpen, closePanel, runningTasks, finishedTasks, clearFinished, dismissTask, focusedToolUseId, getByToolUseId } =
        useWorkflowState();
    const [showFinished, setShowFinished] = useState(true);
    // Store only the id and re-look-up the task each render, so the modal keeps
    // showing the live WorkflowTask (updated agents/stats) as the workflow
    // progresses instead of a frozen snapshot taken at click time (issue #347).
    const [transcriptToolUseId, setTranscriptToolUseId] = useState<string | null>(null);
    const transcriptTask = transcriptToolUseId ? getByToolUseId(transcriptToolUseId) ?? null : null;
    const panelRef = useRef<HTMLDivElement>(null);
    const now = useNow(panelOpen && runningTasks.length > 0);

    const { cancelTask } = useBackgroundTaskActions();

    // When the panel opens, move focus into it so keystrokes (notably Escape)
    // act on the panel — closing it — instead of the chat input behind it. On
    // close, restore focus to wherever it was (e.g. the chat input).
    useEffect(() => {
        if (!panelOpen) return;
        const prevFocus = document.activeElement as HTMLElement | null;
        panelRef.current?.focus();
        return () => prevFocus?.focus?.();
    }, [panelOpen]);

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
        if (!panelOpen || transcriptToolUseId) return;
        const handleMouseDown = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                closePanel();
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [panelOpen, transcriptToolUseId, closePanel]);

    if (!panelOpen) return null;

    return (
        <Portal>
            <div
                ref={panelRef}
                tabIndex={-1}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        e.stopPropagation();
                        closePanel();
                    }
                }}
                className="fixed end-0 top-0 bottom-0 w-[24rem] max-w-[92vw] z-40 flex flex-col bg-surface-raised border-s border-border-default shadow-2xl outline-none"
            >
                <div className="flex items-center justify-between px-4 h-[44px] border-b border-border-subtle shrink-0">
                    <div className="text-text-primary text-[1rem] font-semibold">{t('backgroundTasks.title')}</div>
                    <button
                        onClick={closePanel}
                        className="p-1 rounded hover:bg-surface-hover transition-colors"
                        title={t('backgroundTasks.close')}
                    >
                        <XMarkIcon className="w-5 h-5 text-text-secondary" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-4">
                    {runningTasks.length === 0 && finishedTasks.length === 0 && (
                        <div className="text-text-primary/50 text-[0.9230rem] text-center mt-8">
                            {t('backgroundTasks.empty')}
                        </div>
                    )}

                    {runningTasks.length > 0 && (
                        <section className="space-y-2">
                            <div className="text-[0.7692rem] uppercase tracking-wide text-text-tertiary">{t('backgroundTasks.running')}</div>
                            {runningTasks.map((task) => (
                                <WorkflowTaskRow
                                    key={task.toolUseId}
                                    task={task}
                                    now={now}
                                    focused={task.toolUseId === focusedToolUseId}
                                    onDismiss={dismissTask}
                                    onCancel={cancelTask}
                                    onOpenTranscript={(t) => setTranscriptToolUseId(t.toolUseId)}
                                />
                            ))}
                        </section>
                    )}

                    {finishedTasks.length > 0 && (
                        <section className="space-y-2">
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={() => setShowFinished((v) => !v)}
                                    className="text-[0.7692rem] uppercase tracking-wide text-text-tertiary hover:text-text-secondary transition-colors"
                                >
                                    {t('backgroundTasks.finishedCount', { count: finishedTasks.length })} {showFinished ? '▾' : '▸'}
                                </button>
                                <button
                                    onClick={clearFinished}
                                    className="text-[0.8461rem] text-text-secondary hover:text-text-primary transition-colors"
                                >
                                    {t('backgroundTasks.clear')}
                                </button>
                            </div>
                            {showFinished &&
                                finishedTasks.map((task) => (
                                    <WorkflowTaskRow
                                        key={task.toolUseId}
                                        task={task}
                                        now={now}
                                        focused={task.toolUseId === focusedToolUseId}
                                        onDismiss={dismissTask}
                                    onCancel={cancelTask}
                                    onOpenTranscript={(t) => setTranscriptToolUseId(t.toolUseId)}
                                    />
                                ))}
                        </section>
                    )}
                </div>
            </div>

            {transcriptTask && (
                <AgentTranscriptModal task={transcriptTask} onClose={() => setTranscriptToolUseId(null)} />
            )}
        </Portal>
    );
}
