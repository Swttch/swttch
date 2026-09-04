import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper} from "./common";

class ScheduleWakeupToolUseDto extends ToolUseBlockDto {
    declare input: {
        delaySeconds?: number;
        prompt?: string;
        reason?: string;
        noop?: boolean;
        stop?: boolean;
    };
}

/**
 * Renders a delay in seconds the way a reader thinks about a wait: "45s",
 * "1m 30s", "1h 5m". The runtime clamps delaySeconds to [60, 3600], so hours
 * are the largest unit worth spelling out.
 */
export function formatWakeupDelay(seconds: number): string {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    return parts.join(' ');
}

export function ScheduleWakeupRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as ScheduleWakeupToolUseDto;
    const input = toolUse.input ?? {};

    // `stop: true` ends the loop and the runtime ignores every other field, so
    // the row says only that — a delay next to it would read as "waking again".
    const summary = input.stop
        ? t('scheduleWakeup.stopped')
        : typeof input.delaySeconds === 'number'
            ? t('scheduleWakeup.wakeIn', {delay: formatWakeupDelay(input.delaySeconds)})
            : '';

    const reason = input.reason ?? '';

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name="ScheduleWakeup" inProgress={!props.toolResult} className="mb-2.5">
                <div className="flex items-center gap-1.5 min-w-0 text-text-primary/60">
                    {summary && <span className="shrink-0">{summary}</span>}
                    {summary && reason && <span className="shrink-0 text-text-tertiary">·</span>}
                    {reason && <span className="truncate">{reason}</span>}
                    {!input.stop && input.noop && (
                        <span className="shrink-0 text-text-tertiary">({t('scheduleWakeup.noop')})</span>
                    )}
                </div>
            </ToolHeader>

            {input.prompt && !input.stop && (
                <Container>
                    <LabelValue label={t('tool.in')} maxHeight="max-h-[105px]">
                        {input.prompt}
                    </LabelValue>
                </Container>
            )}
        </ToolWrapper>
    );
}
