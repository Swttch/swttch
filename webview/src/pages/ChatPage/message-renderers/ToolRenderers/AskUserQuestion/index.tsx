import { Container, LabelValue, RendererProps, ToolHeader, ToolWrapper } from "../common";
import { useTranslation } from "@/i18n";
import { useTranscriptViewMode } from "../../transcriptViewMode";

/** The CLI answers `User has answered your questions: "Q1"="A1", "Q2"="A2". ...`: each question with its answer. */
function parseAnswers(output: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const match of output.matchAll(/"([^"]+)"="([^"]*)"/g)) map.set(match[1], match[2]);
    return map;
}

export function AskUserQuestionRenderer(props: RendererProps) {
    const { t } = useTranslation('chatTools');
    const toolUse = props.toolUse;
    const input = toolUse.input as { questions?: Array<{ question: string }> } | undefined;
    const toolResult = props.toolResult as
        | { message?: { content: Array<{ content: string }> } }
        | undefined;
    const output = toolResult?.message?.content?.[0]?.content ?? "";

    const isStreaming = props.message?.isStreaming === true;
    const viewMode = useTranscriptViewMode();

    const rawQuestions = input?.questions;
    const questions = Array.isArray(rawQuestions) ? rawQuestions : [];
    const hasValidQuestions = questions.length > 0 && typeof questions[0].question === "string";

    const inProgress = !toolResult && (isStreaming || !hasValidQuestions);

    // In the views that follow the desktop app the question is the card under the transcript and says nothing here
    // while it waits. Once it is over it is a card of its own: a row for each question with its answer under it, or
    // "Skipped" when the question was turned down (measured on the desktop app's recording).
    if (viewMode !== null) {
        if (!toolResult) return <div hidden data-testid="question-pending" />;
        const answers = parseAnswers(output);
        const declined = /declined to run|doesn't want to proceed/i.test(output);
        const rows = hasValidQuestions ? (questions as Array<{ question: string; header?: string }>) : [];
        if (rows.length === 0) return output && !declined ? <div className="whitespace-pre-wrap text-[0.9rem] text-text-secondary">{output}</div> : null;
        return (
            <div
                data-testid="question-answered"
                className="mb-[2.1rem] mt-[0.5rem] flex w-full max-w-[33.4rem] flex-col overflow-hidden rounded-[0.8125rem] border border-text-primary/[0.07] text-[0.9rem] leading-[1.25rem]"
            >
                {rows.map((q, idx) => {
                    const answer = answers.get(q.question);
                    const answered = !declined && answer !== undefined;
                    return (
                        <div key={idx} className="border-t border-text-primary/[0.07] px-[1.0625rem] py-[0.85rem] first:border-t-0">
                            <div className="text-text-primary">{q.question}</div>
                            <div className="mt-[0.35rem] text-text-secondary">{answered ? answer : t('askUserQuestion.card.skipped', { ns: 'chat' })}</div>
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader
                name={toolUse.name}
                inProgress={inProgress}
                className="mb-2.5"
            />

            {toolResult && (
                <Container>
                    {hasValidQuestions && (
                        <LabelValue label={t('askUserQuestion.ask')}>
                            {questions.map((q, idx) => (
                                <div key={idx}>{q.question}</div>
                            ))}
                        </LabelValue>
                    )}
                    <LabelValue label={t('askUserQuestion.out')} maxHeight="max-h-[60px]">
                        {output}
                    </LabelValue>
                </Container>
            )}
        </ToolWrapper>
    );
}
