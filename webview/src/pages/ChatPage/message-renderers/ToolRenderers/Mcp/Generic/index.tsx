import {ReactNode} from "react";
import {useTranslation} from "@/i18n";
import {parseUserDeclined, declineDisplayText} from "@/shared";
import {RendererProps, ToolHeader, ToolWrapper, DeclinedNote, toolResultText, toolResultRawText} from "../../common";
import {McpToolBody, McpToolRow} from "../_common";
import {mcpHeaderLabel, mcpInputPreview} from "./cursorMcp";

/**
 * Header for any MCP tool, Cursor-style: a `Server [tool]` label plus a dim
 * preview of the most relevant input value. Exposed on its own so a dedicated
 * MCP renderer can reuse the exact same header and only override the body.
 */
export const McpToolHeader = (props: {name: string; input?: Record<string, unknown> | null}) => {
    const {name, input} = props;
    const label = mcpHeaderLabel(name);
    const preview = mcpInputPreview(input);

    return (
        <ToolHeader name={label}>
            {preview && (
                <div className="truncate text-text-primary/60 text-[0.9230rem] font-mono">
                    {preview}
                </div>
            )}
        </ToolHeader>
    );
};

/**
 * Raw `OUT` row for an MCP tool result. Errors render here too — no special
 * styling — matching Cursor's generic fallback. Returns null when empty.
 */
export const McpToolOutput = (props: {children?: ReactNode}) => {
    const {children} = props;
    const {t} = useTranslation('chatTools');
    if (!children) return null;
    return (
        <McpToolBody>
            <McpToolRow label={t('mcp.common.out')}>{children}</McpToolRow>
        </McpToolBody>
    );
};

/**
 * Generic fallback renderer for any `mcp__server__tool` call that has no
 * dedicated renderer registered. Replicates Cursor's behaviour: header label +
 * input preview, and the raw tool result in an OUT row (input itself is not
 * echoed as an IN row — the header preview stands in for it).
 */
export function GenericMcpRenderer(props: RendererProps) {
    const {toolUse, toolResult, message} = props;
    const input = toolUse.input as Record<string, unknown> | undefined;
    const outputText = toolResultText(toolResult);
    // Raw, not display text: the display form deliberately drops the decline
    // marker so result rows stay empty, so the decision has to be read from what
    // was actually recorded — and is then shown as recorded.
    const rawText = toolResultRawText(toolResult);
    const declined = parseUserDeclined(rawText);

    return (
        <ToolWrapper message={message} groupClassName="pb-2.5">
            <McpToolHeader name={toolUse.name} input={input} />
            {declined
                ? <DeclinedNote text={declineDisplayText(rawText)} />
                : <McpToolOutput>{outputText}</McpToolOutput>}
        </ToolWrapper>
    );
}
