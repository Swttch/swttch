import {Streamdown} from 'streamdown';
import {math} from '@/utils/mathPlugin';
import {code} from '@/utils/codePlugin';
import {mermaid, MERMAID_CONTROLS, useMermaidOptions} from '@/utils/mermaidPlugin';
import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {useChatStreamContextOrNull} from "@/contexts/ChatStreamContext";
import {useState} from "react";
import {ChevronRightIcon} from "@heroicons/react/20/solid";
import {useTranscriptViewMode} from "../transcriptViewMode";
import {isUserDeclined} from "./common/toolStatus";
import {findPlanFileContent} from "./planFromTranscript";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper} from "./common";
import {DesktopPlanCard, PlanProposingLine, planTitle} from "../../AcceptPlanPanel/DesktopPlanCard";
import {usePendingPlan} from "../../AcceptPlanPanel/PendingPlanContext";
import type {LoadedMessageDto} from "@/types";

class ExitPlanModeToolUseDto extends ToolUseBlockDto {
    declare input: {
        plan?: string;
    };
}

/** Whether a message the person sent comes after this entry: then the turn this call belongs to is not the one that goes on. */
function promptFollows(messages: LoadedMessageDto[] | undefined, uuid: string | undefined): boolean {
    if (!messages || !uuid) return false;
    const at = messages.findIndex((message) => message.uuid === uuid);
    if (at === -1) return false;
    return messages.slice(at + 1).some((message) => {
        if (message.type !== 'user') return false;
        const content = (message.message as { content?: unknown } | undefined)?.content;
        // An answer to a call is a user entry too; only what the person typed is a later turn.
        return !(Array.isArray(content) && content.length > 0 && content.every((block) => (block as { type?: unknown }).type === 'tool_result'));
    });
}

export function ExitPlanModeRenderer(props: RendererProps) {
    const mermaidOptions = useMermaidOptions();
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as ExitPlanModeToolUseDto;
    const messages = useChatStreamContextOrNull()?.messages;
    // `input.plan` is empty when the plan file was written in the same turn as
    // ExitPlanMode; the text is then in the transcript as that Write (#467).
    const plan = toolUse.input?.plan
        || (messages ? findPlanFileContent(messages, toolUse.id) : undefined)
        || '';
    const toolResult = props.toolResult as { message?: { content: Array<{ content: string; is_error?: boolean }> } } | undefined;
    const resultBlock = toolResult?.message?.content?.[0];
    const isError = resultBlock?.is_error ?? false;
    const feedbackContent = resultBlock?.content;
    const declined = isUserDeclined(props.toolResult);
    const statusText = toolResult
        ? (isError ? t('exitPlanMode.stayedInPlanMode') : t('exitPlanMode.approved'))
        : undefined;

    const headerName = plan ? t('exitPlanMode.title') : t('exitPlanMode.planModeTitle');
    const viewMode = useTranscriptViewMode();
    const waitingPlan = usePendingPlan();
    const [open, setOpen] = useState(false);
    const { t: tChat } = useTranslation('chat');

    // In the views that follow the desktop app the plan is one line, "Proposing plan x" while it waits and "Proposed
    // plan x" after, that opens to the plan; the card under the chat is where it is answered.
    if (viewMode !== null) {
        // While the plan waits, the card that asks about it stands here, where the call stands in the conversation.
        if (!toolResult) {
            return waitingPlan !== null && waitingPlan.pending.toolUseId === toolUse.id
                ? <DesktopPlanCard pending={waitingPlan.pending} onApprove={waitingPlan.onApprove} onDeny={waitingPlan.onDeny} />
                : <PlanProposingLine title={planTitle(plan)} plan={plan} current={!promptFollows(messages, props.message?.uuid)} />;
        }
        const title = (plan.split('\n').map((line) => line.trim()).find((line) => line !== '') ?? '').replace(/^#+\s*/, '');
        return (
            <div data-testid="plan-row">
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen((value) => !value)}
                    className="flex w-full items-center gap-[0.5624rem] pt-1 pb-1 text-start leading-[0.9rem] text-[0.9375rem] text-[var(--tr-muted)] transition-colors hover:text-[var(--tr-hover)]"
                >
                    {isError && !declined ? (
                        <span className="min-w-0 truncate">
                            {tChat('acceptPlan.proposing', { title: '' }).trim()} <span className="text-[rgb(226,88,110)]">{tChat('acceptPlan.failed')}</span>
                        </span>
                    ) : (
                        <span className="min-w-0 truncate">
                            {tChat(toolResult ? 'acceptPlan.proposed' : 'acceptPlan.proposing', { title })}
                            {isError && declined ? ` ${tChat('acceptPlan.notApproved')}` : ''}
                        </span>
                    )}
                    <ChevronRightIcon className={`-ms-[0.3376rem] h-[0.9rem] w-[0.9rem] shrink-0 transition-transform rtl:-scale-x-100 ${open ? 'rotate-90 rtl:-rotate-90' : ''}`} />
                </button>
                {open && plan && (
                    <div className="markdown-content mt-3 mb-1 text-text-primary text-[1rem] leading-relaxed">
                        <Streamdown mode="static" controls={{ code: true, table: true, mermaid: MERMAID_CONTROLS }} plugins={{ math, code, mermaid }} mermaid={mermaidOptions}>
                            {plan}
                        </Streamdown>
                    </div>
                )}
            </div>
        );
    }

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name={headerName} inProgress={!props.toolResult} className="mb-2.5" />

            {/* Same text size as a reply (AssistantMessageRenderer). Without it the
                body inherits the tool row's smaller size, so the plan reads smaller
                than the rest of the chat (#467). */}
            {plan && (
                <div className="markdown-content mb-2 text-text-primary text-[1rem] leading-relaxed">
                    <Streamdown
                        mode="static"
                        controls={{ code: true, table: true, mermaid: MERMAID_CONTROLS }}
                        plugins={{ math, code, mermaid }}
                        mermaid={mermaidOptions}
                    >
                        {plan}
                    </Streamdown>
                </div>
            )}

            {statusText && (
                <div className="text-[0.9230rem] text-text-primary/50">{statusText}</div>
            )}

            {isError && feedbackContent && (
                <Container className="mt-1">
                    <LabelValue label={t('exitPlanMode.feedbackLabel')} className="border-b border-border-subtle" maxHeight="max-h-[60px]">
                        {feedbackContent}
                    </LabelValue>
                </Container>
            )}
        </ToolWrapper>
    );
}
