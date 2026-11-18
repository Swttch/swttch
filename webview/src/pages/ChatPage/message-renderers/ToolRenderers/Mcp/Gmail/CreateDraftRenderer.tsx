import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {RendererProps, ToolHeader, ToolWrapper, toolResultText} from "../../common";
import {McpToolBody, McpToolRow, formatMcpToolName} from "../_common";

class CreateDraftToolUseDto extends ToolUseBlockDto {
    declare input: {
        to?: string[];
        cc?: string[];
        bcc?: string[];
        subject?: string;
        body?: string;
        htmlBody?: string;
        replyToMessageId?: string;
    };
}

const RecipientLine = (props: {label: string; values?: string[]}) => {
    const {label, values} = props;
    if (!Array.isArray(values) || values.length === 0) return null;
    return (
        <div className="flex items-start gap-2 p-2 border-b border-border-subtle">
            <span className="text-tool-label-fg uppercase text-[0.7692rem] min-w-[1.75rem] pt-[0.0625rem]">
                {label}
            </span>
            <div className="flex-1 text-text-primary/80 text-[0.8461rem] break-words">
                {values.join(', ')}
            </div>
        </div>
    );
};

export function CreateDraftRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const {toolUse: rawToolUse, toolResult} = props;
    const toolUse = rawToolUse as CreateDraftToolUseDto;
    const name = formatMcpToolName(toolUse.name);
    const input = toolUse.input ?? {};
    const subject = input.subject ?? '';
    const body = input.body ?? '';

    const outputText = toolResultText(toolResult);

    return (
        <ToolWrapper message={props.message} groupClassName="pb-2.5">
            <ToolHeader name={name} description={t('gmail.createDraft.description')} />

            <McpToolBody>
                <RecipientLine label={t('gmail.createDraft.to')} values={input.to} />
                <RecipientLine label={t('gmail.createDraft.cc')} values={input.cc} />
                <RecipientLine label={t('gmail.createDraft.bcc')} values={input.bcc} />
                {subject && (
                    <div className="p-2 border-b border-border-subtle text-text-primary font-medium text-[0.9230rem]">
                        {subject}
                    </div>
                )}
                {body && (
                    <div className="p-2 border-b border-border-subtle text-text-primary/80 text-[0.8461rem] whitespace-pre-wrap last:border-b-0">
                        {body}
                    </div>
                )}
                {outputText && (
                    <McpToolRow label="OUT">{outputText}</McpToolRow>
                )}
            </McpToolBody>
        </ToolWrapper>
    );
}
