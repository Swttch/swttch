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
            <ToolHeader name="CronDelete" inProgress={!props.toolResult} className="mb-2.5">
                {/* dir="ltr": a job id is an opaque token, so it keeps its own
                    order under `<html dir="rtl">` like every other code value. */}
                {id ? (
                    <div dir="ltr" className="text-text-primary/60 truncate font-mono">
                        {t('cron.id', {id})}
                    </div>
                ) : undefined}
            </ToolHeader>

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
