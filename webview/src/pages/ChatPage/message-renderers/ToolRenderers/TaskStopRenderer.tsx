import {ToolUseBlockDto} from "@/dto";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper, toolResultText} from "./common";
import {useTranslation} from "@/i18n";

class TaskStopToolUseDto extends ToolUseBlockDto {
    declare input: {
        task_id?: string;
        /**
         * Still in the current TaskStop schema, marked "Deprecated: use task_id
         * instead", and it is what the legacy names `KillShell`/`KillBash`
         * carry. The CLI resolves `task_id ?? shell_id`; so does this row.
         */
        shell_id?: string;
    };
}

/** The tool's declared output shape: a status message plus what was stopped. */
interface TaskStopResult {
    message?: string;
    task_id?: string;
    task_type?: string;
    command?: string;
}

/**
 * The result arrives as a JSON object, which read as a wall of braces in the
 * result row. Parsed, its fields become a meta line like TaskOutput's.
 *
 * Returns null for anything that is not that object — a plain-text error, or a
 * shape from some other build — so the caller falls back to showing the text as
 * recorded rather than dropping it.
 */
function parseTaskStopResult(text: string): TaskStopResult | null {
    if (!text.trim().startsWith('{')) return null;
    try {
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return parsed as TaskStopResult;
    } catch {
        return null;
    }
}

export function TaskStopRenderer(props: RendererProps) {
    const { t } = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as TaskStopToolUseDto;
    const resultText = toolResultText(props.toolResult);
    const parsed = parseTaskStopResult(resultText);

    // The id the call named, or — when it named none — the one the result reports.
    const taskId = toolUse.input?.task_id ?? toolUse.input?.shell_id ?? parsed?.task_id ?? '';
    const taskType = parsed?.task_type ?? '';
    const command = parsed?.command ?? '';
    const hasMeta = !!(taskType || command);

    // The message when the result parsed, the raw text when it did not.
    const output = parsed ? (parsed.message ?? '') : resultText;

    return (
        <ToolWrapper message={props.message}>
            {/* The CLI still normalizes `KillShell` and `KillBash` onto TaskStop,
                so the header echoes the name that was actually called rather
                than the current one — otherwise an old session reads wrong. */}
            <ToolHeader name={toolUse.name} inProgress={!props.toolResult} className="mb-2.5">
                <div className="text-text-primary/60 truncate text-[0.9230rem]">{t('task.common.taskPrefix')} "{taskId}"</div>
            </ToolHeader>

            {props.toolResult && (output || hasMeta) && (
                <Container>
                    {hasMeta && (
                        <div className="flex items-start p-2 gap-4 text-[0.8461rem] font-mono min-w-0">
                            {taskType && (
                                <div className="shrink-0">
                                    <span className="text-text-primary/40">{t('task.output.type')} </span>
                                    <span className="text-text-primary/80">{taskType}</span>
                                </div>
                            )}
                            {command && (
                                <div className="min-w-0">
                                    <span className="text-text-primary/40">{t('task.stop.command')} </span>
                                    <span dir="ltr" className="text-text-primary/80">{command}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {output && (
                        <LabelValue
                            label={t('task.common.out')}
                            className={hasMeta ? 'border-t border-border-subtle' : undefined}
                            maxHeight="max-h-[105px]"
                        >
                            {output}
                        </LabelValue>
                    )}
                </Container>
            )}
        </ToolWrapper>
    );
}
