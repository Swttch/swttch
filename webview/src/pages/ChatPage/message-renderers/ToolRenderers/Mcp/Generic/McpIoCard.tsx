import {Fragment, ReactNode} from "react";
import {CollapsibleBox} from "../_common";
import {HighlightedCode} from "./HighlightedCode";
import {formatMcpFieldValue, isPlainObject, mcpFieldLabel} from "./formatMcpPayload";

/**
 * Input/output card of the generic MCP renderer, laid out like the desktop
 * app's: one rounded card, a small caption per section, and a divider between
 * the sections. `dir="ltr"` because the content is raw code and JSON, which
 * would mirror under an RTL page.
 *
 * `leading-normal` is set here because the message body this sits in is
 * `text-xs`, whose line height is a fixed 16px: a value of several lines at this
 * card's font size would otherwise be set at barely over 1x.
 */
export const McpIoCard = (props: {children?: ReactNode}) => {
    const {children} = props;
    return (
        <div dir="ltr" className="mt-3 rounded-lg border border-border-subtle p-3 text-[0.9231rem] leading-normal">
            {children}
        </div>
    );
};

/**
 * One section of the card, with a small caption when `label` is given. Sections
 * after the first get a divider above.
 */
export const McpIoSection = (props: {label?: string; children?: ReactNode}) => {
    const {label, children} = props;
    return (
        <div className="[&:not(:first-child)]:mt-3 [&:not(:first-child)]:pt-3 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border-subtle">
            {label && <div className="mb-1.5 text-[0.8461rem] text-tool-label-fg">{label}</div>}
            {children}
        </div>
    );
};

/**
 * Code or JSON inside a section: its own rounded, tinted box. Long content is
 * clamped with a fade and opens on click, and wraps instead of scrolling
 * sideways.
 */
export const McpIoCodeBox = (props: {children?: ReactNode}) => {
    const {children} = props;
    return (
        <div className="rounded-md border border-border-subtle bg-[var(--md-code-block-bg)] p-2.5 font-mono text-[0.8461rem]">
            <CollapsibleBox
                collapsedMaxHeight={200}
                className="monospace-block min-w-0 whitespace-pre-wrap break-words text-text-primary/80"
            >
                {children}
            </CollapsibleBox>
        </div>
    );
};

/**
 * The input as one captioned field per key: caption in the left column, value in
 * the right. An object value is not flattened into text; it opens a nested table
 * under its caption with a rule on its left, so a nested `env` reads as a group.
 * A `command` string, which is a shell command by the name every shell-style MCP
 * tool gives it, sits in a coloured code box under its caption, as it does in the
 * desktop app.
 */
export const McpInputFields = (props: {entries: Array<[string, unknown]>}) => {
    const {entries} = props;
    return (
        <div className="grid grid-cols-[minmax(5rem,9rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5">
            {entries.map(([key, value]) => {
                if (isPlainObject(value) && Object.keys(value).length > 0) {
                    return (
                        <div key={key} className="col-span-2">
                            <div className="text-tool-label-fg">{mcpFieldLabel(key)}</div>
                            <div className="mt-1 ml-1.5 border-l border-border-subtle pl-3">
                                <McpInputFields entries={Object.entries(value)} />
                            </div>
                        </div>
                    );
                }
                if (key === 'command' && typeof value === 'string' && value !== '') {
                    return (
                        <div key={key} className="col-span-2">
                            <div className="mb-1.5 text-tool-label-fg">{mcpFieldLabel(key)}</div>
                            <McpIoCodeBox><HighlightedCode text={value} language="bash" /></McpIoCodeBox>
                        </div>
                    );
                }
                return (
                    <Fragment key={key}>
                        <div className="text-tool-label-fg break-words">{mcpFieldLabel(key)}</div>
                        <CollapsibleBox
                            collapsedMaxHeight={200}
                            className={`min-w-0 whitespace-pre-wrap break-words text-text-primary/80${typeof value === 'string' ? '' : ' font-mono'}`}
                        >
                            {formatMcpFieldValue(value)}
                        </CollapsibleBox>
                    </Fragment>
                );
            })}
        </div>
    );
};

/** Plain-text result: no box, just the text (under its caption when the section has one). */
export const McpIoPlainText = (props: {children?: ReactNode}) => {
    const {children} = props;
    return (
        <div className="whitespace-pre-wrap break-words text-text-primary/70">
            {children}
        </div>
    );
};

/** The result of a failed call: the whole text in the error colour, without a box. */
export const McpIoErrorText = (props: {children?: ReactNode}) => {
    const {children} = props;
    return (
        <div className="whitespace-pre-wrap break-words font-mono text-[0.8461rem] text-state-error-fg">
            {children}
        </div>
    );
};
