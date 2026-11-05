import {Streamdown} from 'streamdown';
import {math} from '@/utils/mathPlugin';
import {code} from '@/utils/codePlugin';
import {mermaid, MERMAID_CONTROLS, useMermaidOptions} from '@/utils/mermaidPlugin';
import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {useChatStreamContextOrNull} from "@/contexts/ChatStreamContext";
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
