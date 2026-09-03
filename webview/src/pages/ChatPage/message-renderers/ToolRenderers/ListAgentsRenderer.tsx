import {ToolUseBlockDto} from "@/dto";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper, toolResultText} from "./common";
import {useTranslation} from "@/i18n";

class ListAgentsToolUseDto extends ToolUseBlockDto {
    declare input: {
        channel?: string;
        q?: string;
    };
}

export function ListAgentsRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as ListAgentsToolUseDto;
    const filter = toolUse.input?.q || toolUse.input?.channel || '';
    const output = toolResultText(props.toolResult);

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader
                name="ListAgents"
                description={filter}
                inProgress={!props.toolResult}
                className="mb-2.5"
            />

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
