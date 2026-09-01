import {Streamdown} from 'streamdown';
import {math} from '@/utils/mathPlugin';
import {code} from '@/utils/codePlugin';
import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper} from "./common";

class ExitPlanModeToolUseDto extends ToolUseBlockDto {
    declare input: {
        plan?: string;
    };
}

export function ExitPlanModeRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as ExitPlanModeToolUseDto;
    const plan = toolUse.input?.plan ?? '';
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

            {plan && (
                <div className="markdown-content mb-2">
                    <Streamdown
                        mode="static"
                        controls={{ code: true, table: true }}
                        plugins={{ math, code }}
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
