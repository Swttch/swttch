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
import {findPlanFileContent} from "./planFromTranscript";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper} from "./common";

class ExitPlanModeToolUseDto extends ToolUseBlockDto {
    declare input: {
        plan?: string;
    };
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
    const statusText = toolResult
        ? (isError ? t('exitPlanMode.stayedInPlanMode') : t('exitPlanMode.approved'))
        : undefined;

    const headerName = plan ? t('exitPlanMode.title') : t('exitPlanMode.planModeTitle');
    const viewMode = useTranscriptViewMode();
    const [open, setOpen] = useState(false);
    const { t: tChat } = useTranslation('chat');

    // In the views that follow the desktop app the plan is one line, "Proposing plan x" while it waits and "Proposed
    // plan x" after, that opens to the plan; the card under the chat is where it is answered.
    if (viewMode !== null) {
        // While the plan waits, its line is drawn under the card that asks about it (DesktopPlanCard).
        if (!toolResult) return <div hidden data-testid="plan-row" />;
        const title = (plan.split('\n').map((line) => line.trim()).find((line) => line !== '') ?? '').replace(/^#+\s*/, '');
        return (
            <div data-testid="plan-row">
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen((value) => !value)}
                    className="flex w-full items-center gap-[0.35rem] py-[0.625rem] text-start text-[0.9656rem] text-text-secondary transition-colors hover:text-text-primary"
                >
                    <span className="min-w-0 truncate">{tChat(toolResult ? 'acceptPlan.proposed' : 'acceptPlan.proposing', { title })}</span>
                    <ChevronRightIcon className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                </button>
                {open && plan && (
                    <div className="markdown-content mb-2 text-text-primary text-[1rem] leading-relaxed">
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
