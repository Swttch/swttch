import {createContext, useContext} from "react";
import type {LoadedMessageDto} from "@/types";
import {AnyContentBlockDto, ContentBlockType, TextBlockDto, ToolResultBlockDto} from "@/dto/message/ContentBlockDto";
import {USER_DECLINED_PREFIX} from "@/shared";

/**
 * Lifecycle state of a tool call, used to color the leading bullet (●):
 *   - `success`  — a result arrived and is not an error    (green)
 *   - `error`    — the result is flagged is_error            (red)
 *   - `declined` — the user denied the tool (a decision, not a failure) (muted)
 *   - `progress` — no result yet but the message is streaming (neutral, blinking)
 *   - `pending`  — no result and not streaming               (neutral, static)
 *
 * Mirrors the Cursor Claude Code extension's success/failure/progress states.
 */
export type ToolStatus = 'success' | 'error' | 'declined' | 'progress' | 'pending';

/** The first content block of a tool_result message, or undefined. */
function firstToolResultBlock(toolResult?: LoadedMessageDto): ToolResultBlockDto | undefined {
    const content = toolResult?.message?.content;
    if (!Array.isArray(content)) return undefined;
    const block = content[0];
    if (!block || block.type !== ContentBlockType.ToolResult) return undefined;
    return block as ToolResultBlockDto;
}

/**
 * Extract displayable text from a tool_result (OUT) message. tool_result content
 * can be a plain string or a content-block array (e.g. [{type:'text',text}]);
 * both are normalized to a single string. Never throws.
 */
export function toolResultText(toolResult?: LoadedMessageDto): string {
    const value = firstToolResultBlock(toolResult)?.content;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        return value
            .map((b: AnyContentBlockDto) => (b.type === ContentBlockType.Text ? (b as TextBlockDto).text : ''))
            .join('');
    }
    return '';
}

/** True when the tool_result block is flagged is_error. Never throws. */
export function toolResultIsError(toolResult?: LoadedMessageDto): boolean {
    return firstToolResultBlock(toolResult)?.is_error === true;
}

/**
 * True when this result is a user's denial decision (not a tool/server failure).
 * The marker is set by the backend on denied permissions and persists in the
 * content, so it is recognized live and after a reload — including when the CLI
 * re-serializes the content as a text-block array rather than a bare string.
 */
export function isUserDeclined(toolResult?: LoadedMessageDto): boolean {
    return toolResultText(toolResult).startsWith(USER_DECLINED_PREFIX);
}

/**
 * Derive the bullet status from a tool's result message and whether its parent
 * message is still streaming. A result, once present, wins regardless of the
 * streaming flag; with no result yet, a streaming message is in `progress`.
 * A user decline is reported as `declined` (it isn't a failure).
 */
export function toolStatus(toolResult?: LoadedMessageDto, isStreaming = false): ToolStatus {
    if (!toolResult) return isStreaming ? 'progress' : 'pending';
    if (isUserDeclined(toolResult)) return 'declined';
    return toolResultIsError(toolResult) ? 'error' : 'success';
}

/**
 * True once the tool's `input` is final and can be read for meaning.
 *
 * While a message streams, `input` is rebuilt from partial JSON, so a field
 * that has not arrived yet looks exactly like one the caller omitted. A
 * renderer that reads meaning into an absent field — "no findings", "all
 * servers", "auto-named" — states that as fact mid-stream and is simply wrong
 * until the rest of the arguments land. Ask this before drawing such a label.
 */
export function isInputSettled(props: {toolResult?: LoadedMessageDto; message?: LoadedMessageDto}): boolean {
    return props.toolResult !== undefined || !(props.message?.isStreaming ?? false);
}

/**
 * Carries the current tool's status down to ToolWrapper without threading a
 * prop through every renderer. ToolRenderer provides it; ToolWrapper consumes
 * it. Defaults to `pending` so ToolWrapper renders correctly with no provider.
 */
export const ToolStatusContext = createContext<ToolStatus>('pending');

export function useToolStatus(): ToolStatus {
    return useContext(ToolStatusContext);
}
