import {useTranslation} from "@/i18n";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper, toolResultText} from "./common";

/** CronList takes no arguments, so the row carries only its result. */
export function CronListRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const output = toolResultText(props.toolResult);

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name="CronList" inProgress={!props.toolResult} className="mb-2.5" />

            {output && (
                <Container>
                    <LabelValue label={t('tool.out')} maxHeight="max-h-[160px]">
                        {output}
                    </LabelValue>
                </Container>
            )}
        </ToolWrapper>
    );
}
