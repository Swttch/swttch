import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper, toolResultText} from "./common";

class ExitWorktreeToolUseDto extends ToolUseBlockDto {
    declare input: {
        action?: 'keep' | 'remove';
        discard_changes?: boolean;
    };
}

export function ExitWorktreeRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as ExitWorktreeToolUseDto;
    const input = toolUse.input ?? {};
    const output = toolResultText(props.toolResult);

    const action = input.action === 'remove'
        ? t('worktree.remove')
        : input.action === 'keep'
            ? t('worktree.keep')
            : '';

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name="ExitWorktree" inProgress={!props.toolResult} className="mb-2.5">
                <div className="flex items-center gap-1.5 min-w-0 text-text-primary/60">
                    {action && <span className="shrink-0">{action}</span>}
                    {/* Discarding is the destructive half of a remove, and it is
                        the one thing a reader scanning the log needs to catch. */}
                    {input.discard_changes && (
                        <span className="shrink-0 text-state-error-fg">{t('worktree.discardChanges')}</span>
                    )}
                </div>
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
