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
    // while it waits; once answered it is each question with its answer under it.
    if (viewMode !== null) {
        if (!toolResult) return <div hidden data-testid="question-pending" />;
        const answers = parseAnswers(output);
        return (
            <div className="flex flex-col gap-[1rem] pb-[0.5rem] text-[0.9rem] leading-[1.25rem]" data-testid="question-answered">
                {(hasValidQuestions ? questions : []).map((q, idx) => (
                    <div key={idx}>
                        <div className="text-text-primary">{q.question}</div>
                        <div className="mt-[0.2rem] text-text-secondary">{answers.get(q.question) ?? ""}</div>
                    </div>
                ))}
                {(!hasValidQuestions || answers.size === 0) && output && !/declined to run|doesn't want to proceed/i.test(output) && (
                    <div className="whitespace-pre-wrap text-text-secondary">{output}</div>
                )}
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
