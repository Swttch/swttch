import React from 'react';
import {LoadedMessageDto} from '../../../types';
import {ToolUseBlockDto} from '../../../dto/message/ContentBlockDto';
import {ToolRendererMap} from "./ToolRenderers";
import {
    ToolHeader,
    ToolWrapper,
    ToolStatusContext,
    ToolDeclinedContext,
    ToolUseContext,
    toolStatus,
    toolResultRawText,
    isUserDeclined,
} from "./ToolRenderers/common";
import {declineDisplayText} from "@/shared";
import {GenericMcpRenderer} from "./ToolRenderers/Mcp/Generic";
import {isMcpToolName} from "./ToolRenderers/Mcp/Generic/cursorMcp";
import {StreamSafeErrorBoundary} from "@/components/StreamSafeErrorBoundary";
import { useTranslation } from '@/i18n';

interface ToolRendererProps {
    toolUse: ToolUseBlockDto;
    message?: LoadedMessageDto;
}

export const ToolRenderer: React.FC<ToolRendererProps> = ({toolUse, message}) => {
    const { t } = useTranslation('chatTools');
    const toolResult = toolUse.tool_result as LoadedMessageDto | undefined;
    const renderKey = JSON.stringify(toolUse.input ?? {});

    const Renderer = ToolRendererMap.get(toolUse.name);

    let body: React.ReactNode;
    if (Renderer) {
        body = (
            <StreamSafeErrorBoundary renderKey={renderKey}>
                <Renderer toolUse={toolUse} toolResult={toolResult} message={message} />
            </StreamSafeErrorBoundary>
        );
    } else if (isMcpToolName(toolUse.name)) {
        // No dedicated renderer: any `mcp__server__tool` call falls back to the
        // generic MCP renderer (Cursor-equivalent).
        body = (
            <StreamSafeErrorBoundary renderKey={renderKey}>
                <GenericMcpRenderer toolUse={toolUse} toolResult={toolResult} message={message} />
            </StreamSafeErrorBoundary>
        );
    } else {
        // Truly non-MCP unknown — bare header; its console.log is the fast-report hook.
        body = (
            <ToolWrapper message={message} onClick={() => console.log(toolUse)}>
                <ToolHeader name={toolUse.name} description={t('message.unknownTool')} />
            </ToolWrapper>
        );
    }

    // Provide the tool's status so every ToolWrapper colors its bullet
    // (success/error/progress/pending) without each renderer threading a prop.
    // A result-less call under a streaming message reads as in-progress.
    return (
        <ToolStatusContext.Provider value={toolStatus(toolResult, message?.isStreaming ?? false)}>
            {/* The MCP cards (JetBrains, Gmail, the generic fallback) already draw
                a decline in their own badge style, so they are left to it —
                otherwise every one of them would show it twice. */}
            <ToolDeclinedContext.Provider
                value={
                    isMcpToolName(toolUse.name) || !isUserDeclined(toolResult)
                        ? null
                        : declineDisplayText(toolResultRawText(toolResult))
                }
            >
                <ToolUseContext.Provider value={toolUse}>
                    {body}
                </ToolUseContext.Provider>
            </ToolDeclinedContext.Provider>
        </ToolStatusContext.Provider>
    );
};
