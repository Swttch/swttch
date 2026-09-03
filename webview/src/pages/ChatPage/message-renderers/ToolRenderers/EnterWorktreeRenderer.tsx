import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper, toolResultText, isInputSettled} from "./common";

class EnterWorktreeToolUseDto extends ToolUseBlockDto {
    declare input: {
        name?: string;
        path?: string;
    };
}

export function EnterWorktreeRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as EnterWorktreeToolUseDto;
    const input = toolUse.input ?? {};
    const output = toolResultText(props.toolResult);

    // `name` creates a worktree, `path` enters an existing one, and neither
    // means the runtime generates a name — three different actions, so the row
    // says which one happened rather than printing a bare string. "Neither" is
    // only knowable once the arguments have finished arriving.
    const summary = input.path
        ? t('worktree.enterPath', {path: input.path})
        : input.name
            ? t('worktree.enterName', {name: input.name})
            : isInputSettled(props)
                ? t('worktree.enterGenerated')
                : '';

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name="EnterWorktree" inProgress={!props.toolResult} className="mb-2.5">
                <div dir="ltr" className="text-text-primary/60 truncate">{summary}</div>
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
