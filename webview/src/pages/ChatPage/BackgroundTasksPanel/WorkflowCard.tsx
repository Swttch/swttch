import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Tooltip } from '@/components/Tooltip';
import { useTranslation } from '@/i18n';
import type { WorkflowAgent, WorkflowTask } from '@/shared';
import { agentDisplayName, agentDisplayStatus, formatTokensFor, workflowAgentCount, workflowTokens } from '@/utils/workflowFormat';
import { useFormatElapsed } from '../transcript/TranscriptActivity';
import { taskDurationMs } from './WorkflowTaskSummary';
import { DismissButton } from './DismissButton';
import { StopButton } from './StopButton';
import { TaskTypeIcon } from './TaskTypeIcon';

/** The agents of one phase of a workflow, in the order the workflow gave them. */
function agentsOfPhase(task: WorkflowTask, phaseIndex: number): WorkflowAgent[] {
    // A workflow with one phase whose agents do not say which phase they are in (a task read back after a reload)
    // has all of them in that phase.
    if (task.phases.length === 1 && task.agents.every((agent) => agent.phaseIndex === undefined)) return task.agents;
    const title = task.phases[phaseIndex]?.title;
    // The title the agent says it is in is what ties it to a phase: the CLI's `phaseIndex` counts the phase headers
    // it streams along with the agents, so it does not line up with the script's own list.
    return task.agents.filter((agent) => (agent.phaseTitle !== undefined ? agent.phaseTitle === title : agent.phaseIndex === phaseIndex));
}

/**
 * A workflow in the background tasks list, as the desktop app draws it: its name and, at the right, how long it took;
 * under that what it is (the status when it did not simply finish, how many agents, how many tokens); what the CLI
 * said of it when it did not finish; and one line for each phase with how many of its agents are done, which opens
 * to the agents' times. A running workflow has a button to stop it in place of the status.
 */
export function WorkflowCard({
    task,
    now,
    focused,
    onCancel,
    onDismiss,
    onOpenTranscript,
}: {
    task: WorkflowTask;
    now: number;
    focused: boolean;
    onCancel: (task: WorkflowTask) => void;
    onDismiss: (toolUseId: string) => void;
    onOpenTranscript: (task: WorkflowTask) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const { t, i18n } = useTranslation('chat');
    const formatElapsed = useFormatElapsed();
    const [openPhases, setOpenPhases] = useState<ReadonlySet<number>>(new Set());
    useEffect(() => {
        if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [focused]);

    const running = task.status === 'running';
    const ms = taskDurationMs(task, now);
    const elapsed = ms === undefined ? '' : formatElapsed(Math.max(0, Math.round(ms / 1000)));
    const agentCount = task.agents.length || workflowAgentCount(task.usage);
    const tokens = formatTokensFor(
        i18n.language,
        workflowTokens(task.usage) || task.agents.reduce((sum, a) => sum + (a.tokens || 0), 0),
    );
    // A running workflow says how many agents are running instead of saying it is running; the clock is beside the
    // stop button, as the desktop app has it.
    const status =
        task.status === 'stopped' ? t('backgroundTasks.statusStopped')
        : task.status === 'failed' ? t('backgroundTasks.statusFailed')
        : null;
    const facts = [
        agentCount !== undefined
            ? t(running ? 'backgroundTasks.agentsRunning' : 'backgroundTasks.agentsCount', { count: agentCount })
            : null,
        tokens ? t('backgroundTasks.tokensLabel', { tokens }) : null,
    ].filter((part): part is string => !!part);
    // What it was asked to be while it runs; what the CLI said of it when it ended without finishing.
    const about = running ? task.description : task.status === 'completed' ? undefined : task.summary || task.description;

    const toggle = (index: number) =>
        setOpenPhases((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });

    return (
        <div
            ref={ref}
            data-testid="workflow-card"
            className={`rounded-[11px] border bg-surface-hover transition-colors ${focused ? 'border-border-focus' : 'border-transparent'}`}
        >
            <div className="cursor-pointer px-[0.83rem] py-[0.775rem] hover:bg-surface-pressed/60 rounded-[11px]" onClick={() => onOpenTranscript(task)}>
                <div className="flex items-center gap-2">
                    <TaskTypeIcon kind="workflow" />
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                        <Tooltip content={task.name} placement="top">
                            <span className="truncate text-[0.9230rem] text-text-primary">{task.name}</span>
                        </Tooltip>
                        <ChevronRightIcon className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary rtl:-scale-x-100" />
                    </div>
                    {(status || elapsed) && (
                        <div className="flex-shrink-0 text-[0.8461rem] text-text-secondary">
                            {status && <span className={task.status === 'failed' ? 'text-state-error-fg' : undefined}>{status}</span>}
                            {status && elapsed ? ' · ' : ''}
                            {elapsed}
                        </div>
                    )}
                    {!running && <DismissButton task={task} onDismiss={onDismiss} />}
                    {running && <StopButton task={task} onCancel={onCancel} />}
                </div>
                {facts.length > 0 && (
                    <div className="mt-0.5 text-[0.8461rem] text-text-secondary">{facts.join(' · ')}</div>
                )}
                {about && <div className={`mt-1 text-[0.8461rem] text-text-secondary ${running ? 'truncate' : ''}`}>{about}</div>}
            </div>

            {task.phases.length > 0 && (
                <div className="border-t border-border-subtle">
                    {task.phases.map((phase, index) => {
                        const agents = agentsOfPhase(task, index);
                        const done = agents.filter((a) => agentDisplayStatus(a.state, task.status) === 'done').length;
                        const open = openPhases.has(index);
                        return (
                            <div key={index}>
                                <button
                                    type="button"
                                    onClick={() => toggle(index)}
                                    aria-expanded={open}
                                    className="flex w-full items-center gap-1.5 px-[0.83rem] py-2 text-start text-[0.8461rem] text-text-secondary hover:text-text-primary"
                                >
                                    {open ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5 rtl:-scale-x-100" />}
                                    <span className="min-w-0 flex-1 truncate">{phase.title}</span>
                                    {agents.length > 0 && <span className="flex-shrink-0">{done}/{agents.length}</span>}
                                </button>
                                {open && agents.length > 0 && (
                                    <div className="px-[0.83rem] pb-2 ps-8 text-[0.8461rem] text-text-secondary">
                                        <div className="flex justify-between pb-1">
                                            <span>{t('backgroundTasks.tableHeader.agent')}</span>
                                            <span>{t('backgroundTasks.tableHeader.time')}</span>
                                        </div>
                                        {agents.map((agent, i) => (
                                            <div key={agent.agentId ?? agent.index ?? i} className="flex items-center justify-between gap-2 text-text-secondary">
                                                <span className="flex min-w-0 items-center gap-1.5">
                                                    {agentDisplayStatus(agent.state, task.status) === 'done' ? (
                                                        <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />
                                                    ) : (
                                                        <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-tertiary" />
                                                    )}
                                                    <span className="truncate">{agentDisplayName(agent)}</span>
                                                </span>
                                                <span className="flex-shrink-0">
                                                    {agent.durationMs ? formatElapsed(Math.max(0, Math.round(agent.durationMs / 1000))) : '—'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
