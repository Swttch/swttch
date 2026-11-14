import {useTranslation} from "@/i18n";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper} from "./common";
import {useTranscriptViewMode} from "../transcriptViewMode";

export function EnterPlanModeRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolResult = props.toolResult as { message?: { content: Array<{ content: string }> } } | undefined;
    const output = toolResult?.message?.content?.[0]?.content ?? '';
    const viewMode = useTranscriptViewMode();
    const {t: tChat} = useTranslation('chat');

    // In the views that follow the desktop app starting to plan is one quiet line with no output box.
    if (viewMode !== null) {
        return (
            <div data-testid="plan-start-row" className="mb-[0.4rem] py-[0.625rem] text-[0.9656rem] text-text-secondary">
                {tChat(props.toolResult ? 'acceptPlan.started' : 'acceptPlan.starting')}
            </div>
        );
    }

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name="EnterPlanMode" inProgress={!props.toolResult} className="mb-2.5" />

            {props.toolResult && (
                <Container>
                    <LabelValue label={t('tool.out')} maxHeight="max-h-[60px]">
                        {output}
                    </LabelValue>
                </Container>
            )}
        </ToolWrapper>
    );
}
