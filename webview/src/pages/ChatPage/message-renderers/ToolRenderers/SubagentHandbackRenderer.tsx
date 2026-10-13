import {ToolUseBlockDto} from "@/dto";
import {RendererProps, ToolHeader, ToolWrapper} from "./common";
import {StreamingMessage} from "../../StreamingMessage";

class SubagentHandbackToolUseDto extends ToolUseBlockDto {
    declare input: {
        message?: string;
    };
}

/**
 * `SubagentHandback` is the tool a subagent calls to deliver its final report to
 * the agent that spawned it (#535). The report is what the reader wants from the
 * subagent, so its body is rendered as markdown rather than folded into a
 * monospace result box, the same way `SendUserMessage` renders its message.
 */
export function SubagentHandbackRenderer(props: RendererProps) {
    const toolUse = props.toolUse as unknown as SubagentHandbackToolUseDto;
    const message = toolUse.input?.message;

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name={toolUse.name} inProgress={!props.toolResult} className="mb-2.5" />

            {message && (
                <StreamingMessage
                    content={message}
                    isStreaming={props.message?.isStreaming ?? false}
                    className="text-text-primary text-[1rem] leading-relaxed"
                    message={props.message}
                />
            )}
        </ToolWrapper>
    );
}
