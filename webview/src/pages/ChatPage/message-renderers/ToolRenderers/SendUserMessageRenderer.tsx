import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {RendererProps, ToolHeader, ToolWrapper} from "./common";
import {StreamingMessage} from "../../StreamingMessage";

/** A device-uploaded file handed to the tool by reference rather than by path. */
interface UploadedAttachmentDto {
    file_uuid?: string;
    file_name?: string;
    size?: number;
    is_image?: boolean;
}

class SendUserMessageToolUseDto extends ToolUseBlockDto {
    declare input: {
        message?: string;
        attachments?: Array<string | UploadedAttachmentDto>;
        status?: 'normal' | 'proactive';
    };
}

/** An attachment is either a filesystem path or an uploaded-file object. */
function attachmentLabel(attachment: string | UploadedAttachmentDto): string {
    if (typeof attachment === 'string') return attachment;
    return attachment?.file_name ?? attachment?.file_uuid ?? '';
}

/**
 * `SendUserMessage` (legacy name `Brief`) carries the reply the user is meant to
 * actually read, so its body is rendered as markdown rather than folded into a
 * monospace result box like an ordinary tool payload.
 */
export function SendUserMessageRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as SendUserMessageToolUseDto;
    const input = toolUse.input ?? {};
    const rawAttachments = input.attachments;
    const attachments = Array.isArray(rawAttachments) ? rawAttachments : [];

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name={toolUse.name} inProgress={!props.toolResult} className="mb-2.5">
                <div className="flex items-center gap-1.5 min-w-0 text-text-primary/60">
                    {/* 'proactive' means the agent opened the conversation rather
                        than answering — worth showing, 'normal' is the default. */}
                    {input.status === 'proactive' && (
                        <span className="shrink-0">{t('sendUserMessage.proactive')}</span>
                    )}
                    {attachments.length > 0 && (
                        <span className="shrink-0 text-text-tertiary">
                            {t('sendUserMessage.attachments', {count: attachments.length})}
                        </span>
                    )}
                </div>
            </ToolHeader>

            {input.message && (
                <StreamingMessage
                    content={input.message}
                    isStreaming={props.message?.isStreaming ?? false}
                    className="text-text-primary text-[1rem] leading-relaxed"
                    message={props.message}
                />
            )}

            {attachments.length > 0 && (
                <div dir="ltr" className="mt-1.5 flex flex-col gap-0.5 font-mono text-[0.8461rem] text-text-tertiary">
                    {attachments.map((attachment, index) => (
                        <div key={index} className="truncate">{attachmentLabel(attachment)}</div>
                    ))}
                </div>
            )}
        </ToolWrapper>
    );
}
