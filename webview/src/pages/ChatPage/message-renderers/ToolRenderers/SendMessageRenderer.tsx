import {ToolUseBlockDto} from "@/dto";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper, toolResultText} from "./common";
import {useTranslation} from "@/i18n";

class SendMessageToolUseDto extends ToolUseBlockDto {
    declare input: {
        to: string;
        message: string;
        summary?: string;
    };
}

/** The result JSON's `message` field is the human-readable outcome ("Resuming
 *  agent ad4bd1a", "Delivered"); the rest (resumedAgentId, pin) are internal
 *  bookkeeping not worth surfacing here. Falls back to the raw text for a
 *  shape this hasn't seen — never hides output it cannot parse. */
function summarizeResult(resultText: string): string {
    if (!resultText) return '';
    try {
        const parsed = JSON.parse(resultText) as { message?: unknown };
        return typeof parsed.message === 'string' ? parsed.message : resultText;
    } catch {
        return resultText;
    }
}

export function SendMessageRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as SendMessageToolUseDto;
    const to = toolUse.input?.to ?? '';
    const input = toolUse.input?.message ?? '';
    const output = summarizeResult(toolResultText(props.toolResult));

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader
                name="SendMessage"
                description={t('sendMessage.to', {to})}
                inProgress={!props.toolResult}
                className="mb-2.5"
            />

            <Container>
                <LabelValue
                    label={t('tool.in')}
                    className="border-b border-border-subtle"
                    maxHeight="max-h-[105px]"
                >
                    {input}
                </LabelValue>
                <LabelValue label={t('tool.out')} maxHeight="max-h-[60px]">
                    {output}
                </LabelValue>
            </Container>
        </ToolWrapper>
    );
}
