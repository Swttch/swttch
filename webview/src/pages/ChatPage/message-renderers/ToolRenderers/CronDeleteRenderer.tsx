import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper, toolResultText} from "./common";

class CronDeleteToolUseDto extends ToolUseBlockDto {
    declare input: {
        id?: string;
    };
}

export function CronDeleteRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as CronDeleteToolUseDto;
    const id = toolUse.input?.id ?? '';
    const output = toolResultText(props.toolResult);

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader
                name="CronDelete"
                description={id ? t('cron.id', {id}) : ''}
                inProgress={!props.toolResult}
                className="mb-2.5"
            />

            {output && (
                <Container>
                    <LabelValue label={t('tool.out')} maxHeight="max-h-[105px]">
                        {output}
                    </LabelValue>
                </Container>
            )}
        </ToolWrapper>
    );
}
