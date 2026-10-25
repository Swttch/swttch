import {useEffect, useState} from "react";
import {ChevronRightIcon, GlobeAltIcon} from "@heroicons/react/24/outline";
import {decodeText, loadFileContent} from "@/components/FilePreviewPane/loadFileContent";
import {htmlTitleOf} from "@/utils/htmlTitle";
import {filePreviewPaneStore} from "@/utils/filePreviewPaneStore";
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
        file_path?: string;
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
/** What a published page is called on its card: the name the call gave it, else the name of the file published. */
function pageTitleOf(input: ArtifactToolUseDto['input'] | undefined): string {
    if (input?.title) return input.title;
    const file = input?.file_path?.split(/[\\/]/).pop() ?? '';
    return file.replace(/\.[^.]+$/, '');
}

/** The `<title>` of the page at `path`, once read; undefined while loading or when the page names none. */
function usePageTitle(path: string | undefined): string | undefined {
    const [title, setTitle] = useState<string | undefined>(undefined);
    useEffect(() => {
        if (!path || !/\.html?$/i.test(path)) return;
        let cancelled = false;
        void loadFileContent(path, () => cancelled).then((result) => {
            if (cancelled || !result.ok || result.kind !== 'html') return;
            setTitle(htmlTitleOf(decodeText(result.pieces)));
        });
        return () => { cancelled = true; };
    }, [path]);
    return title;
}

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
    const pageFile = input?.file_path;
    const pageTitle = usePageTitle(pageFile);

    // A page that was published (or updated) is a card with its name that opens it, as Claude
    // Desktop draws it. The sentence the CLI answers with ("Published ... Version 1, version id ...")
    // says nothing the card does not, so it is left out; any other kind of call keeps its result.
    const publishes = input?.action === undefined || input.action === 'publish';
    if (publishes && pageUrl && toolUse.name === 'Artifact') {
        const cardClass = "flex w-full max-w-[420px] items-center gap-2.5 rounded-xl border border-border-default bg-surface-hover/30 px-3.5 py-2.5 text-left text-text-primary no-underline transition-colors hover:bg-surface-hover";
        const content = (
            <>
                <GlobeAltIcon className="h-4 w-4 shrink-0 text-text-secondary"/>
                <span dir="auto" className="min-w-0 flex-1 truncate text-[0.9231rem]">{pageTitle || pageTitleOf(input) || t('tool.artifactFallbackTitle')}</span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-tertiary"/>
            </>
        );
        // The page is a file on this machine, so it opens in the pane beside the chat as Desktop opens it;
        // a call that names no file can only point at the published address.
        return (
            <ToolWrapper message={props.message}>
                {pageFile && /\.html?$/i.test(pageFile) ? (
                    <button type="button" onClick={() => filePreviewPaneStore.open(pageFile, pageUrl)} className={cardClass}>{content}</button>
                ) : (
                    <a href={pageUrl} target="_blank" rel="noopener noreferrer" className={cardClass}>{content}</a>
                )}
            </ToolWrapper>
        );
    }

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
