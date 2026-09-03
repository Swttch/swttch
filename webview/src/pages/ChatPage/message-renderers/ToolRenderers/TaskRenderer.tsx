import { ToolUseBlockDto, ToolResultBlockDto } from "@/types";
import { Container, LabelValue, RendererProps, ToolHeader, ToolWrapper } from "./common";
import { ToolRenderer } from "../ToolRenderer";
import { MessageRole, LoadedMessageType, ContentBlockType } from "@/dto";
import { useTranslation } from "@/i18n";

class TaskToolUseDto extends ToolUseBlockDto {
    caller: { type: 'direct' };
    declare input: {
        description: string;
        subagent_type?: string;
        prompt: string;
    };
}

export function TaskRenderer(props: RendererProps) {
    const { t } = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as TaskToolUseDto;

    const name = toolUse.name;
    const description = toolUse.input?.description ?? '';
    const input = toolUse.input?.prompt ?? '';
    const subAgentMessages = Array.isArray(toolUse.subAgentMessages) ? toolUse.subAgentMessages : [];

    // Extract tool_use blocks from sub-agent messages
    // Build a sub-agent toolUseMap for merging tool_results
    const subAgentToolUseMap = new Map<string, ToolUseBlockDto>();

    for (const msg of subAgentMessages) {
        if (msg.role === MessageRole.Assistant) {
            for (const block of msg.content) {
                if (block.type === ContentBlockType.ToolUse) {
                    const tuBlock = block as ToolUseBlockDto;
                    subAgentToolUseMap.set(tuBlock.id, tuBlock);
                }
            }
        }
    }

    // Merge sub-agent tool_results into sub-agent tool_uses
    // (same pattern as ChatMessageArea does for top-level messages)
    for (const msg of subAgentMessages) {
        if (msg.role === MessageRole.User) {
            for (const block of msg.content) {
                if (block.type === ContentBlockType.ToolResult) {
                    const trBlock = block as ToolResultBlockDto;
                    const matchingToolUse = subAgentToolUseMap.get(trBlock.tool_use_id);
                    if (matchingToolUse) {
                        // Create a minimal LoadedMessageDto-like wrapper
                        matchingToolUse.tool_result = {
                            type: LoadedMessageType.User,
                            message: { role: MessageRole.User, content: [block] },
                        } as any;
                    }
                }
            }
        }
    }

    const hasSubAgentMessages = subAgentToolUseMap.size > 0;

    return (
        <>
            <ToolWrapper message={props.message}>
                {/* IMPORTANT: ToolHeader uses {children || <description>} pattern,
                so we MUST include description inside children to preserve it */}
                <ToolHeader name={name} inProgress={!props.toolResult && !hasSubAgentMessages} className="mb-2.5">
                    <div className="text-text-primary/60">{description}</div>
                </ToolHeader>

                {/* Prompt input (always visible, collapsed) */}
                <Container>
                    <LabelValue
                        label={t('task.common.in')}
                        className="border-b border-border-subtle"
                        maxHeight="max-h-[60px]"
                    >
                        {input}
                    </LabelValue>
                </Container>
            </ToolWrapper>

            {/* Sub-agent tool calls, nested under a connecting line so a
                background agent's ongoing activity — which keeps appending
                here after this Task's own turn has already finished (#383) —
                reads as a side thread rather than a continuation of the main
                conversation. */}
            {hasSubAgentMessages && (
                <div className="ms-6 ps-4 border-s border-border-subtle">
                    {Array.from(subAgentToolUseMap.values()).map((tu) => (
                        <ToolRenderer key={tu.id} toolUse={tu} message={props.message} />
                    ))}
                </div>
            )}
        </>
    );
}
