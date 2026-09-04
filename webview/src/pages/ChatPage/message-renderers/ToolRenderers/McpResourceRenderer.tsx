import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper, toolResultText, isInputSettled} from "./common";

/**
 * The built-in MCP resource tools — `ListMcpResourcesTool`,
 * `ReadMcpResourceTool` and `ReadMcpResourceDirTool`, plus the legacy names
 * `ListMcpResources` and `ReadMcpResource` the CLI still normalizes — take the
 * same two fields and differ only in which are required. One row shape serves
 * all five: the server, the resource URI beside it, the result underneath.
 *
 * These are the CLI's own tools, not `mcp__server__tool` calls, so the generic
 * MCP fallback in ToolRenderer never sees them.
 */
class McpResourceToolUseDto extends ToolUseBlockDto {
    declare input: {
        server?: string;
        uri?: string;
    };
}

export function McpResourceRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as McpResourceToolUseDto;
    const input = toolUse.input ?? {};
    const output = toolResultText(props.toolResult);

    // Omitting `server` on the list tool means "every configured server", which
    // is a real choice the reader should see rather than an empty slot. Only an
    // argument list that has finished arriving can be read that way, though —
    // mid-stream the field is just not here yet.
    const server = input.server || (isInputSettled(props) ? t('mcpResource.allServers') : '');

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name={toolUse.name} inProgress={!props.toolResult} className="mb-2.5">
                <div className="flex items-center gap-1.5 min-w-0 text-text-primary/60">
                    <span className="shrink-0">{server}</span>
                    {input.uri && (
                        <span dir="ltr" className="font-mono truncate text-text-tertiary">{input.uri}</span>
                    )}
                </div>
            </ToolHeader>

            {output && (
                <Container>
                    <LabelValue label={t('tool.out')} maxHeight="max-h-[160px]">
                        {output}
                    </LabelValue>
                </Container>
            )}
        </ToolWrapper>
    );
}
