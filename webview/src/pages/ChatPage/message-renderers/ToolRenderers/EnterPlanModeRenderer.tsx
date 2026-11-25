import {useTranslation} from "@/i18n";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper} from "./common";

export function EnterPlanModeRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolResult = props.toolResult as { message?: { content: Array<{ content: string }> } } | undefined;
    const output = toolResult?.message?.content?.[0]?.content ?? '';

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name="EnterPlanMode" inProgress={!props.toolResult} className="mb-2.5" />

            {props.toolResult && (
                <Container>
                    <LabelValue label={t('tool.out')} maxHeight="max-h-[60px]">
                        {output}
                    </LabelValue>
                </Container>
            )}
        </ToolWrapper>
    );
}
