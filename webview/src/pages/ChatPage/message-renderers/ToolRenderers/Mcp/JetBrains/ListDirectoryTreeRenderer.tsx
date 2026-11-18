import {ToolUseBlockDto} from "@/dto";
import {RendererProps, ToolWrapper, toolResultText, toolResultIsError, Container, LabelValue} from "../../common";
import {JetBrainsToolHeader, JetBrainsResultError, safeParseJson, inputProjectPath} from "./_shared";

class ListDirectoryTreeToolUseDto extends ToolUseBlockDto {
    declare input: {directoryPath: string; maxDepth?: number};
}

/** `list_directory_tree`: directory link in the header, pseudo-graphic tree (collapsible) in the body. */
export function ListDirectoryTreeRenderer(props: RendererProps) {
    const toolUse = props.toolUse as unknown as ListDirectoryTreeToolUseDto;
    const input = (toolUse.input ?? {}) as Record<string, unknown>;
    const dir = toolUse.input?.directoryPath ?? '';
    const out = toolResultText(props.toolResult);
    const tree = safeParseJson<{tree?: string}>(out)?.tree ?? out;
    const isError = toolResultIsError(props.toolResult);

    return (
        <ToolWrapper message={props.message} groupClassName="pb-2.5">
            <JetBrainsToolHeader
                name={toolUse.name}
                path={dir || undefined}
                projectPath={inputProjectPath(input)}
                input={input}
            />
            {isError ? (
                <JetBrainsResultError toolResult={props.toolResult} />
            ) : (
                tree && (
                    <Container className="mt-1.5">
                        <LabelValue maxHeight="max-h-[12.5rem]">{tree}</LabelValue>
                    </Container>
                )
            )}
        </ToolWrapper>
    );
}
