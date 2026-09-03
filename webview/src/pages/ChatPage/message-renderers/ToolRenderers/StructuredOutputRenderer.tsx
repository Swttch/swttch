import {Streamdown} from 'streamdown';
import {math} from '@/utils/mathPlugin';
import {code} from '@/utils/codePlugin';
import {ToolUseBlockDto} from "@/dto";
import {Container, RendererProps, ToolHeader, ToolWrapper} from "./common";

class StructuredOutputToolUseDto extends ToolUseBlockDto {
    // A dynamic workflow's agent script defines its own schema for this call —
    // `file`/`purpose`/`report` are this session's fields, not a fixed
    // contract; another workflow's StructuredOutput can carry entirely
    // different ones.
    declare input: Record<string, unknown>;
}

/**
 * A dynamic workflow agent's structured findings, submitted via the
 * StructuredOutput tool so the workflow script can consume them
 * programmatically. The schema is whatever that script's agent() call
 * declared — not fixed across workflows — so this renders the one
 * consistently-useful shape (a `report` markdown field, as seen in practice)
 * and falls back to pretty-printed JSON for anything else, rather than
 * hard-coding to one workflow's fields (issue #383).
 */
export function StructuredOutputRenderer(props: RendererProps) {
    const toolUse = props.toolUse as unknown as StructuredOutputToolUseDto;
    const input = toolUse.input ?? {};
    const report = typeof input.report === 'string' ? input.report : undefined;
    const file = typeof input.file === 'string' ? input.file : undefined;
    const purpose = typeof input.purpose === 'string' ? input.purpose : undefined;

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name="StructuredOutput" inProgress={!props.toolResult} className="mb-2.5">
                <div className="text-text-primary/60 truncate">{file ?? purpose ?? ''}</div>
            </ToolHeader>

            {file && purpose && (
                <div className="text-text-primary/50 text-[0.8461rem] mb-2">{purpose}</div>
            )}

            {report ? (
                <div className="markdown-content mb-2">
                    <Streamdown
                        mode="static"
                        controls={{ code: true, table: true }}
                        plugins={{ math, code }}
                    >
                        {report}
                    </Streamdown>
                </div>
            ) : (
                <Container>
                    <pre dir="ltr" className="p-2 text-[0.8461rem] font-mono text-text-primary/80 whitespace-pre-wrap break-words">
                        {JSON.stringify(input, null, 2)}
                    </pre>
                </Container>
            )}
        </ToolWrapper>
    );
}
