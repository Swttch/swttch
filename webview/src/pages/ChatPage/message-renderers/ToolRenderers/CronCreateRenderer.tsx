import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper, toolResultText, isInputSettled} from "./common";

class CronCreateToolUseDto extends ToolUseBlockDto {
    declare input: {
        cron?: string;
        prompt?: string;
        recurring?: boolean;
        durable?: boolean;
    };
}

export function CronCreateRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as CronCreateToolUseDto;
    const input = toolUse.input ?? {};
    const output = toolResultText(props.toolResult);

    // Both flags default to something the user cannot see in the arguments:
    // recurring defaults to true, durable to false. Spelling out the effective
    // value beats showing nothing when the field was omitted — but a field that
    // has not streamed in yet is not an omitted one, so wait for the arguments
    // to land before reading a default out of an absence.
    const settled = isInputSettled(props);
    const recurring = input.recurring !== false;
    const durable = input.durable === true;

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name="CronCreate" inProgress={!props.toolResult} className="mb-2.5">
                <div className="flex items-center gap-1.5 min-w-0 text-text-primary/60">
                    {input.cron && (
                        <span dir="ltr" className="shrink-0 font-mono">{input.cron}</span>
                    )}
                    {settled && (
                        <span className="shrink-0 text-text-tertiary">
                            {recurring ? t('cron.recurring') : t('cron.oneShot')}
                        </span>
                    )}
                    {settled && (
                        <span className="shrink-0 text-text-tertiary">
                            {durable ? t('cron.durable') : t('cron.sessionOnly')}
                        </span>
                    )}
                </div>
            </ToolHeader>

            {input.prompt && (
                <Container>
                    <LabelValue label={t('tool.in')} maxHeight="max-h-[105px]">
                        {input.prompt}
                    </LabelValue>
                </Container>
            )}

            {output && (
                <Container className={input.prompt ? 'mt-1.5' : ''}>
                    <LabelValue label={t('tool.out')} maxHeight="max-h-[105px]">
                        {output}
                    </LabelValue>
                </Container>
            )}
        </ToolWrapper>
    );
}
