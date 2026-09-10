import { useEffect, useState } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { ToolUseBlockDto } from '@/dto';
import type { WorkflowNotification } from '@/dto/message/ContentBlockDto';
import { useWorkflowState } from '@/contexts/WorkflowStateContext';
import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';
import {
    agentDisplayName,
    agentDisplayStatus,
    agentDotClass,
    formatDuration,
    formatTokens,
    WORKFLOW_STATUS_COLOR,
} from '@/utils/workflowFormat';
import { parseWorkflowName } from '@/utils/workflowName';
import { RendererProps, ToolHeader, ToolWrapper, toolResultText } from './common';

/** Workflow tool input — either an inline `script` or a `scriptPath` resume. */
class WorkflowToolUseDto extends ToolUseBlockDto {
    declare input: {
        description?: string;
        script?: string;
        scriptPath?: string;
        resumeFromRunId?: string;
    };
}

/** Re-render every second while `active` so a running workflow's timer ticks. */
function useNow(active: boolean): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [active]);
    return now;
}

const MAX_INLINE_DOTS = 24;

export function WorkflowRenderer(props: RendererProps) {
    const { t } = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as WorkflowToolUseDto;
    const { getByToolUseId, openPanel } = useWorkflowState();
    const live: WorkflowTask | undefined = getByToolUseId(toolUse.id);
    const notification: WorkflowNotification | undefined = toolUse.workflowNotification;

    const launched = !!toolResultText(props.toolResult);
    const status = live?.status ?? notification?.status ?? (launched ? 'running' : undefined);
    const isRunning = status === 'running';
    const statusColor = (status && WORKFLOW_STATUS_COLOR[status]) || 'text-text-primary/60';

    const now = useNow(isRunning && !!live);

    const name = live?.name || parseWorkflowName(toolUse.input);
    const description = live?.description ?? toolUse.input?.description;

    const phases = live?.phases ?? [];

    const agents = live?.agents ?? [];
    const agentCount =
        agents.length ||
        live?.usage?.agentCount ||
        notification?.usage?.agentCount ||
        undefined;

    const durationMs =
        live?.usage?.durationMs ??
        notification?.usage?.durationMs ??
        (live && isRunning ? now - live.startedAt : undefined);
    const duration = formatDuration(durationMs);

    // Prefer the authoritative workflow-level total (live usage / final
    // notification) over summing per-agent tokens, which fall back only while the
    // total isn't known yet (e.g. early in a live run).
    const liveTokens = agents.reduce((sum, a) => sum + (a.tokens || 0), 0);
    const tokens = formatTokens(
        live?.usage?.subagentTokens || notification?.usage?.subagentTokens || liveTokens,
    );

    const summary = live?.summary ?? notification?.summary;
    const usage = live?.usage ?? notification?.usage;

    // 'Workflow' now lives in the ToolHeader (consistent with other tools), so
    // the meta line carries only the runtime stats.
    const metaParts = [
        agentCount !== undefined ? t('workflow.agentsMeta', { count: agentCount }) : undefined,
        duration,
        tokens ? t('workflow.tokensMeta', { value: tokens }) : undefined,
    ].filter(Boolean) as string[];

    const showDots = agentCount !== undefined && agentCount <= MAX_INLINE_DOTS && agents.length > 0;

    // Header detail next to the "Workflow" title — only once we have a task id,
    // so a not-yet-started run never renders "Task ID: undefined".
    const phaseSuffix =
        phases.length > 0 ? t('workflow.phaseSuffix', { count: phases.length }) : '';
    const headerDetail = live?.taskId ? `${t('workflow.taskIdDetail', { taskId: live.taskId })}${phaseSuffix}` : '';

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name="Workflow" description={headerDetail} />
            <div className="mt-4 max-w-[44rem]">
                <div className="rounded-lg border border-border-default bg-surface-raised overflow-hidden">
                    {/* Header: workflow name + status + chevron (opens the panel) */}
                    <button
                        type="button"
                        onClick={() => openPanel(toolUse.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-start hover:bg-surface-hover transition-colors"
                    >
                        <div className="min-w-0 flex-1 text-text-primary text-[1rem] font-semibold truncate">
                            {name}
                        </div>
                        {status && (
                            <span className={`text-[0.8461rem] shrink-0 ${statusColor}`}>{status}</span>
                        )}
                        <ChevronRightIcon className="w-4 h-4 text-text-tertiary shrink-0 rtl:-scale-x-100" />
                    </button>

                    {/* Meta line: N agents · duration · tokens */}
                    {metaParts.length > 0 && (
                        <div className="px-3 pb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8461rem] text-text-primary/60">
                            {metaParts.map((part, i) => (
                                <span key={i} className="flex items-center gap-2">
                                    {i > 0 && <span className="text-text-tertiary">·</span>}
                                    {part}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Per-agent progress dots */}
                    {showDots && (
                        <div className="px-3 pb-2 flex flex-wrap gap-1">
                            {agents.map((a, i) => (
                                <span
                                    key={a.agentId ?? a.index ?? i}
                                    title={agentDisplayName(a)}
                                    className={`inline-block w-1.5 h-1.5 rounded-full ${agentDotClass(
                                        // These dots only render from `live`, so its status is
                                        // the one that settles them (the notification's is a
                                        // plain string and may lag a live stop).
                                        agentDisplayStatus(a.state, live?.status ?? 'running'),
                                    )}`}
                                />
                            ))}
                        </div>
                    )}

                    {/* Body: running hint, or final summary/result */}
                    {isRunning && !summary && (
                        <div className="px-3 pb-2.5 text-[0.8461rem] text-text-primary/50">
                            {t('workflow.runningInBackground')}
                        </div>
                    )}

                    {(summary || usage) && (
                        <div className="border-t border-border-subtle px-3 py-2.5 space-y-2">
                            {summary && (
                                <div className="text-[0.9230rem] text-text-primary/80">{summary}</div>
                            )}
                            {usage && (
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8461rem] text-text-primary/50 font-mono">
                                    {usage.agentCount !== undefined && <span>{t('workflow.agentsUsageLabel', { count: usage.agentCount })}</span>}
                                    {tokens && <span>{t('workflow.tokensUsageLabel', { value: tokens })}</span>}
                                    {usage.toolUses !== undefined && <span>{t('workflow.toolsUsageLabel', { count: usage.toolUses })}</span>}
                                    {duration && <span>{duration}</span>}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {description && name !== description && (
                    <div className="mt-1 px-1 text-[0.8461rem] text-text-primary/50">{description}</div>
                )}
            </div>
        </ToolWrapper>
    );
}
