import {ToolUseBlockDto} from "@/dto";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper} from "./common";
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

export function TaskStopRenderer(props: RendererProps) {
    const { t } = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as TaskStopToolUseDto;
    const taskId = toolUse.input?.task_id ?? toolUse.input?.shell_id ?? '';

    const toolResult = props.toolResult as {
        message?: { content?: Array<{ content?: string | Array<{ type?: string; content?: string }> }> }
    } | undefined;

    const rawContent = toolResult?.message?.content?.[0]?.content;
    const resultText = typeof rawContent === 'string'
        ? rawContent
        : (Array.isArray(rawContent) ? rawContent[0]?.content ?? '' : '');

    return (
        <ToolWrapper message={props.message}>
            {/* The CLI still normalizes `KillShell` and `KillBash` onto TaskStop,
                so the header echoes the name that was actually called rather
                than the current one — otherwise an old session reads wrong. */}
            <ToolHeader name={toolUse.name} inProgress={!props.toolResult} className="mb-2.5">
                <div className="text-text-primary/60 truncate text-[0.9230rem]">{t('task.common.taskPrefix')} "{taskId}"</div>
            </ToolHeader>

            {props.toolResult && resultText && (
                <Container>
                    <LabelValue label={t('task.common.out')} maxHeight="max-h-[105px]">
                        {resultText}
                    </LabelValue>
                </Container>
            )}
        </ToolWrapper>
    );
}
