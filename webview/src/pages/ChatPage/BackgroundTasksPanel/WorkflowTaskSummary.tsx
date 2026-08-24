import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';
import { agentDotClass, formatDuration, formatTokens, WORKFLOW_STATUS_COLOR } from '@/utils/workflowFormat';

interface Props {
    task: WorkflowTask;
    now: number;
    /** Show the phases list — the panel card always does; the modal header omits
     *  it since the agent tabs below already convey progress per-phase. */
    showPhases?: boolean;
}

/**
 * The summary block a Background tasks panel card shows for one task: status,
 * agents/tokens/time, description, phases. Shared with AgentTranscriptModal's
 * header (issue #347 follow-up) so the detail view — which is supposed to be
 * the fuller view — is never missing information the summary card already has.
 */
export function WorkflowTaskSummary(props: Props) {
    const { task, now, showPhases = true } = props;
    const { t } = useTranslation('chat');

    const isRunning = task.status === 'running';
    const statusColor = WORKFLOW_STATUS_COLOR[task.status] || 'text-text-primary/60';
    const agentCount = task.agents.length || task.usage?.agentCount;
    const durationMs = task.usage?.durationMs ?? (isRunning ? now - task.startedAt : undefined);
    const duration = formatDuration(durationMs);
    // Authoritative workflow-level total first; per-agent sum is only a fallback
    // (see WorkflowRenderer) so the header stays consistent with the agent table.
    const liveTokens = task.agents.reduce((sum, a) => sum + (a.tokens || 0), 0);
    const tokens = formatTokens(task.usage?.subagentTokens || liveTokens);

    return (
        <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8461rem]">
                <span className={`font-medium ${statusColor}`}>
                    {isRunning && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-current me-1.5 align-middle animate-pulse" />
                    )}
                    {task.status}
                </span>
                <span className="text-text-tertiary">·</span>
                <span className="text-text-primary/60">
                    {task.taskType === 'local_bash' ? t('backgroundTasks.bashLabel') : t('backgroundTasks.workflowLabel')}
                </span>
                {agentCount !== undefined && (
                    <>
                        <span className="text-text-tertiary">·</span>
                        <span className="text-text-primary/60">{t('backgroundTasks.agentsCount', { count: agentCount })}</span>
                    </>
                )}
                {tokens && (
                    <>
                        <span className="text-text-tertiary">·</span>
                        <span className="text-text-primary/60">{t('backgroundTasks.tokensLabel', { tokens })}</span>
                    </>
                )}
                {duration && (
                    <>
                        <span className="text-text-tertiary">·</span>
                        <span className="text-text-primary/60">{duration}</span>
                    </>
                )}
            </div>

            {task.description && (
                <div className="mt-1 text-[0.8461rem] text-text-primary/50">{task.description}</div>
            )}

            {showPhases && task.phases.length > 0 && (
                <div className="mt-2">
                    <div className="text-[0.7692rem] uppercase tracking-wide text-text-tertiary mb-1">{t('backgroundTasks.phasesLabel')}</div>
                    <div className="space-y-0.5">
                        {task.phases.map((p, i) => (
                            <div key={i} className="flex items-center gap-2 text-[0.8461rem] text-text-primary/70">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-text-tertiary" />
                                <span className="truncate">{p.title}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/** Standalone agents table, split out so the panel card can keep showing it
 *  (issue #347 follow-up left this out of the shared summary — the modal
 *  already renders per-agent detail via its tabs, so repeating the table
 *  there would duplicate the same numbers right below). */
export function WorkflowAgentsTable(props: { task: WorkflowTask }) {
    const { task } = props;
    const { t } = useTranslation('chat');
    if (task.agents.length === 0) return null;

    return (
        <div className="mt-2 overflow-x-auto no-scrollbar">
            <table className="w-full text-[0.8461rem] font-mono">
                <thead>
                    <tr className="text-text-tertiary text-start">
                        <th className="font-normal pb-1 pe-2">{t('backgroundTasks.tableHeader.agent')}</th>
                        <th className="font-normal pb-1 px-2 text-end">{t('backgroundTasks.tableHeader.tokens')}</th>
                        <th className="font-normal pb-1 px-2 text-end">{t('backgroundTasks.tableHeader.tools')}</th>
                        <th className="font-normal pb-1 ps-2 text-end">{t('backgroundTasks.tableHeader.time')}</th>
                    </tr>
                </thead>
                <tbody>
                    {task.agents.map((a) => (
                        <tr key={a.agentId} className="text-text-primary/75">
                            <td className="py-0.5 pe-2 max-w-[10rem] truncate">
                                <span
                                    className={`inline-block w-1.5 h-1.5 rounded-full me-1.5 align-middle ${agentDotClass(a.status)}`}
                                />
                                {a.label}
                            </td>
                            <td className="py-0.5 px-2 text-end">{formatTokens(a.tokens) ?? '0'}</td>
                            <td className="py-0.5 px-2 text-end">{a.tools}</td>
                            <td className="py-0.5 ps-2 text-end">{formatDuration(a.durationMs) ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
