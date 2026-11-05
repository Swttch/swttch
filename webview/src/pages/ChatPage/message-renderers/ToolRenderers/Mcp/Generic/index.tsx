import {useState} from "react";
import {useTranslation} from "@/i18n";
import {parseUserDeclined, declineDisplayText} from "@/shared";
import {SessionGalleryViewer} from "@/components/SessionGalleryViewer";
import {
    RendererProps,
    ToolHeader,
    ToolWrapper,
    DeclinedNote,
    toolResultText,
    toolResultRawText,
    toolResultIsError,
    toolResultImages,
    toolResultPictureKeys,
    useToolStatus,
} from "../../common";
import {mcpHeaderLabel, mcpInputPreview} from "./cursorMcp";
import {formatMcpResultParts, mcpInputEntries} from "./formatMcpPayload";
import {HighlightedCode} from "./HighlightedCode";
import {
    McpInputFields,
    McpIoCard,
    McpIoCodeBox,
    McpIoErrorText,
    McpIoPlainText,
    McpIoSection,
} from "./McpIoCard";

/** Stands in for the tool label while the status sentence is split around it. */
const LABEL_MARK = '\u0001';

/**
 * Header for any MCP tool, desktop-style: a `server: tool` label with what the
 * call is doing, plus a dim preview of the most relevant input value. Exposed on
 * its own so a dedicated MCP renderer can reuse the exact same header and only
 * override the body.
 *
 * The wording follows the call's state: "using" until a result has come back,
 * "used" once one has. A failed call stays on "using", since it never finished
 * using the tool, and gets a red failure mark after it. A declined call never
 * ran, so it carries no wording at all.
 */
export const McpToolHeader = (props: {name: string; input?: Record<string, unknown> | null}) => {
    const {name, input} = props;
    const {t} = useTranslation('chatTools');
    const status = useToolStatus();
    const label = mcpHeaderLabel(name);
    const preview = mcpInputPreview(input);
    // The wording is one sentence per language with the label in it, because the
    // word order differs ("Used x" / "x 사용함"). Fill the label's place with a
    // marker and split there, so the label stays bold and the words around it do not.
    const [before, after] = status === 'declined'
        ? ['', '']
        : t(status === 'success' ? 'mcp.common.used' : 'mcp.common.using', {name: LABEL_MARK}).split(LABEL_MARK);
    const heading = (
        <>
            {before && <span className="font-normal me-[3px]">{before}</span>}
            {label}
            {after && <span className="font-normal ms-[3px]">{after}</span>}
        </>
    );

    return (
        <ToolHeader name={heading}>
            <>
                {/* The first element after the label and wording sits 2px further from it. */}
                {status === 'error' && <div className="text-state-error-fg ms-[2px]">{t('mcp.common.failed')}</div>}
                {preview && (
                    <div className={`truncate text-text-primary/60 text-[0.9230rem] font-mono${status === 'error' ? '' : ' ms-[2px]'}`}>
                        {preview}
                    </div>
                )}
            </>
        </ToolHeader>
    );
};

/**
 * Generic fallback renderer for any `mcp__server__tool` call that has no
 * dedicated renderer registered. Replicates Cursor's behaviour: header label +
 * input preview, then a desktop-style card: an input section holding every input
 * key (Cursor shows none, so a call whose input has no preview key showed
 * nothing, #596), an output section holding the tool result, and any pictures
 * the result carries. A failed call puts its error text, in the error colour,
 * above the input.
 */
export function GenericMcpRenderer(props: RendererProps) {
    const {toolUse, toolResult, message} = props;
    const {t} = useTranslation('chatTools');
    const [viewing, setViewing] = useState<number | null>(null);
    const input = toolUse.input as Record<string, unknown> | undefined;
    const inputEntries = mcpInputEntries(input);
    const output = formatMcpResultParts(toolResultText(toolResult));
    // Raw, not display text: the display form deliberately drops the decline
    // marker so result rows stay empty, so the decision has to be read from what
    // was actually recorded — and is then shown as recorded.
    const rawText = toolResultRawText(toolResult);
    const declined = parseUserDeclined(rawText);
    const failed = !declined && toolResultIsError(toolResult);
    const hasOutputText = !declined && output.text !== '';
    const images = declined ? [] : toolResultImages(toolResult);
    const imageKeys = toolResultPictureKeys(toolResult, toolUse.id);

    return (
        <ToolWrapper message={message} groupClassName="pb-2.5">
            <McpToolHeader name={toolUse.name} input={input} />
            {(inputEntries || hasOutputText || images.length > 0) && (
                <McpIoCard>
                    {failed && hasOutputText && (
                        <McpIoSection>
                            <McpIoErrorText>{output.text}</McpIoErrorText>
                        </McpIoSection>
                    )}
                    {inputEntries && (
                        <McpIoSection label={t('mcp.common.input')}>
                            <McpInputFields entries={inputEntries} />
                        </McpIoSection>
                    )}
                    {!failed && hasOutputText && (
                        // The caption tells output from input; with no input above it, it has nothing to tell apart.
                        <McpIoSection label={inputEntries ? t('mcp.common.output') : undefined}>
                            {output.json
                                ? <McpIoCodeBox><HighlightedCode text={output.text} language="json" /></McpIoCodeBox>
                                : <McpIoPlainText>{output.text}</McpIoPlainText>}
                        </McpIoSection>
                    )}
                    {images.length > 0 && (
                        <McpIoSection>
                            {images.map((src, index) => (
                                // Clicking a picture opens the viewer, as it does for a Read row.
                                <button
                                    key={index}
                                    type="button"
                                    onClick={() => setViewing(index)}
                                    className="block max-w-full cursor-zoom-in"
                                >
                                    <img src={src} alt="" className="block max-w-full rounded-md" />
                                </button>
                            ))}
                        </McpIoSection>
                    )}
                </McpIoCard>
            )}
            {viewing !== null && (
                <SessionGalleryViewer
                    entryUuid={toolResult?.uuid}
                    localSrcs={images}
                    localKeys={imageKeys}
                    openedIndex={viewing}
                    onClose={() => setViewing(null)}
                />
            )}
            {declined && <DeclinedNote text={declineDisplayText(rawText)} />}
        </ToolWrapper>
    );
}
