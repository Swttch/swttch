import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper, toolResultText} from "./common";

class RemoteTriggerToolUseDto extends ToolUseBlockDto {
    declare input: {
        action?: string;
        trigger_id?: string;
        session_id?: string;
        cursor?: string;
        body?: Record<string, unknown>;
    };
}

export function RemoteTriggerRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as RemoteTriggerToolUseDto;
    const input = toolUse.input ?? {};
    const output = toolResultText(props.toolResult);

    // Every action targets at most one id; whichever is present is the subject
    // of the row, so the header does not have to name which kind it is.
    const target = input.trigger_id || input.session_id || '';
    const body = input.body && Object.keys(input.body).length > 0
        ? JSON.stringify(input.body, null, 2)
        : '';

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name="RemoteTrigger" inProgress={!props.toolResult} className="mb-2.5">
                <div className="flex items-center gap-1.5 min-w-0 text-text-primary/60">
                    {input.action && <span className="shrink-0">{input.action}</span>}
                    {target && (
                        <span dir="ltr" className="font-mono truncate text-text-tertiary">{target}</span>
                    )}
                </div>
            </ToolHeader>

            {body && (
                <Container>
                    <LabelValue label={t('tool.in')} maxHeight="max-h-[105px]">
                        {body}
                    </LabelValue>
                </Container>
            )}

            {output && (
                <Container className={body ? 'mt-1.5' : ''}>
                    <LabelValue label={t('tool.out')} maxHeight="max-h-[160px]">
                        {output}
                    </LabelValue>
                </Container>
            )}
        </ToolWrapper>
    );
}
