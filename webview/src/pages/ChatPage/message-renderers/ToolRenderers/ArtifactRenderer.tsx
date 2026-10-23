import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper, toolResultText} from "./common";

class ArtifactToolUseDto extends ToolUseBlockDto {
    declare input: {
        action?: string;
        title?: string;
        url?: string;
        type_url?: string;
        intent?: string;
        collection?: string;
        doc_id?: string;
    };
}

/** An Artifact's page address: what the result sentence names and the reader wants to open. */
const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/;

/**
 * The first Artifact address in a tool result such as "Created a new Artifact at
 * https://claude.ai/artifact/<id> (version ...)", or undefined when it names none.
 */
export function artifactUrlFrom(text: string): string | undefined {
    return ARTIFACT_URL.exec(text)?.[0];
}

/**
 * The one-line subject of an Artifact call. Every shape of the call has a
 * different identifying field (`quickstart` carries an intent, a create carries
 * a title, an update carries the page address, a data call carries the
 * collection), so the header names whichever is present rather than a label.
 */
export function artifactCallSubject(input: ArtifactToolUseDto['input'] | undefined): string {
    if (!input) return '';
    const subject = input.title
        ?? input.intent
        ?? input.url
        ?? input.type_url
        ?? (input.collection ? [input.collection, input.doc_id].filter(Boolean).join('/') : undefined);
    return subject ?? '';
}

/**
 * The card for the CLI's Artifact tools (`Artifact`, `ArtifactComments`,
 * `ArtifactData`), which `/slides` and `/design` drive (#584). Without a
 * registered renderer the reader sees a bare "unknown" row for each call and no
 * way to reach the page the agent just published.
 */
export function ArtifactRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as ArtifactToolUseDto;
    const input = toolUse.input;
    const subject = artifactCallSubject(input);
    const output = toolResultText(props.toolResult);
    const pageUrl = artifactUrlFrom(output) ?? input?.url;
    // An update names the page by its address, which the link row below already
    // shows as something to click. Saying it twice in a row reads as a glitch.
    const headerSubject = subject === pageUrl ? '' : subject;

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name={toolUse.name} inProgress={!props.toolResult} className="mb-2.5">
                <div className="flex items-center gap-1.5 min-w-0 text-text-primary/60">
                    {input?.action && <span className="shrink-0">{input.action}</span>}
                    {headerSubject && (
                        <span dir="ltr" className="truncate text-text-tertiary">{headerSubject}</span>
                    )}
                </div>
            </ToolHeader>

            {pageUrl && (
                <div className="mb-1.5 text-text-primary/60 truncate">
                    <a href={pageUrl} target="_blank" rel="noopener noreferrer" dir="ltr"
                       className="hover:text-text-primary/80 hover:underline">{pageUrl}</a>
                </div>
            )}

            {output && (
                <Container>
                    <LabelValue label={t('tool.out')} maxHeight="max-h-[105px]">
                        {output}
                    </LabelValue>
                </Container>
            )}
        </ToolWrapper>
    );
}
