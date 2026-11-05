import {ToolUseBlockDto} from "@/dto";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper, toolResultText} from "./common";
import {useTranslation} from "@/i18n";
import {StreamingMessage} from "../../StreamingMessage";
import {useDesktopSession} from "@/hooks/useDesktopSession";

class SendMessageToolUseDto extends ToolUseBlockDto {
    declare input: {
        to: string;
        message: string;
        summary?: string;
    };
}

/** The result JSON's `message` field is the human-readable outcome ("Resuming
 *  agent ad4bd1a", "Delivered"); the rest (resumedAgentId, pin) are internal
 *  bookkeeping not worth surfacing here. Falls back to the raw text for a
 *  shape this hasn't seen — never hides output it cannot parse. */
function summarizeResult(resultText: string): string {
    if (!resultText) return '';
    try {
        const parsed = JSON.parse(resultText) as { message?: unknown };
        return typeof parsed.message === 'string' ? parsed.message : resultText;
    } catch {
        return resultText;
    }
}

/**
 * What Claude Desktop's session messaging answers with:
 * `Message delivered to session local_ab12 ("Session title"); ... (delivery: delivered; ...)`.
 * The title of the receiving session and how the delivery went are in it, so the card can name the session the
 * way Desktop does instead of by its id.
 */
export function parseSessionDelivery(resultText: string): {title?: string; delivery?: string} {
    const title = /\bto session\s+\S+\s+\("(.*?)"\)/.exec(resultText)?.[1];
    const delivery = /\(delivery:\s*([A-Za-z_]+)/.exec(resultText)?.[1];
    return {
        ...(title !== undefined && title !== '' && {title}),
        ...(delivery !== undefined && {delivery}),
    };
}

/** A message to another Claude session: its id starts with `local_`, and Desktop's reply names it. */
function isSessionMessage(to: string, resultText: string): boolean {
    return to.startsWith('local_') || parseSessionDelivery(resultText).title !== undefined;
}

/**
 * The card for a message sent to another session, as Claude Desktop draws it: "Message sent" and the title of
 * the session it went to, how the delivery went, and the message itself as text.
 */
function SessionMessageCard(props: {to: string; text: string; resultText: string; message?: RendererProps['message']; inProgress: boolean}) {
    const {t} = useTranslation('chatTools');
    const {title: answeredTitle, delivery} = parseSessionDelivery(props.resultText);
    // Desktop's answer names the session; when it does not (an older answer, or none yet), Desktop's own session
    // file does. An id says nothing to a reader, so when neither is known the line says only that it was another
    // session.
    const looked = useDesktopSession(props.to, answeredTitle === undefined)?.title;
    const title = answeredTitle ?? looked ?? t('sendMessage.anotherSession');
    return (
        <ToolWrapper message={props.message} groupClassName="pb-2.5">
            <ToolHeader name={t('sendMessage.sent')} description={title} inProgress={props.inProgress} className="mb-1" />
            <div data-testid="session-message-card">
                {delivery && (
                    <div className="mb-1.5 text-[0.8461rem] text-text-primary/50">
                        {delivery === 'delivered' ? t('sendMessage.delivered') : delivery}
                    </div>
                )}
                {props.text && (
                    // The message sits in a card of its own, as a result does in the other tool cards.
                    <div className="rounded border border-border-subtle bg-surface-hover px-2 py-1.5">
                        <StreamingMessage
                            content={props.text}
                            isStreaming={props.message?.isStreaming ?? false}
                            className="text-text-primary text-[1rem] leading-relaxed"
                            message={props.message}
                            plain
                        />
                    </div>
                )}
            </div>
        </ToolWrapper>
    );
}

export function SendMessageRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as SendMessageToolUseDto;
    const to = toolUse.input?.to ?? '';
    const input = toolUse.input?.message ?? '';
    const resultText = toolResultText(props.toolResult);
    const output = summarizeResult(resultText);

    if (isSessionMessage(to, resultText)) {
        return (
            <SessionMessageCard to={to} text={input} resultText={resultText} message={props.message} inProgress={!props.toolResult} />
        );
    }

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader
                name="SendMessage"
                description={t('sendMessage.to', {to})}
                inProgress={!props.toolResult}
                className="mb-2.5"
            />

            <Container>
                <LabelValue
                    label={t('tool.in')}
                    className="border-b border-border-subtle"
                    maxHeight="max-h-[105px]"
                >
                    {input}
                </LabelValue>
                <LabelValue label={t('tool.out')} maxHeight="max-h-[60px]">
                    {output}
                </LabelValue>
            </Container>
        </ToolWrapper>
    );
}
