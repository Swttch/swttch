import {ReactNode, useEffect, useRef, useState} from "react";
import {cn} from "@/utils/cn";

/**
 * Convert an MCP tool's raw name into a human-readable label.
 *
 * Format: `mcp__<server>__<tool>` → `<Server Pretty> [<tool>]`
 *
 * Server name tokens are split on `_`:
 *   - Tokens that are all-lowercase AND ≤2 chars are uppercased (e.g. `ai` → `AI`).
 *   - All other tokens get their first letter uppercased, rest kept as-is
 *     (e.g. `claude` → `Claude`, `Gmail` → `Gmail`).
 *
 * Falls back to the original string when the input does not look like an MCP
 * name (no `mcp__` prefix, or fewer than 3 `__`-separated segments). Never throws.
 *
 * Examples:
 *   `mcp__claude_ai_Gmail__search_threads` → `Claude AI Gmail [search_threads]`
 *   `mcp__filesystem__read_file`           → `Filesystem [read_file]`
 *   `Bash`                                 → `Bash`
 */
export function formatMcpToolName(name: string): string {
    if (!name) return name;

    const segments = name.split('__');
    // Need at least: ['mcp', '<server>', '<tool>']
    if (segments.length < 3 || segments[0] !== 'mcp') return name;

    const serverSegment = segments[segments.length - 2];
    const toolSegment = segments[segments.length - 1];

    const serverPretty = serverSegment
        .split('_')
        .map((token) => {
            if (token.length === 0) return token;
            if (token === token.toLowerCase() && token.length <= 2) {
                return token.toUpperCase();
            }
            return token.charAt(0).toUpperCase() + token.slice(1);
        })
        .join(' ');

    return `${serverPretty} [${toolSegment}]`;
}

/**
 * Per-family naming contract. Each MCP tool family (JetBrains, …) implements ONE
 * of these and registers it in `Mcp/humanize.ts`; general chat UI (e.g. the
 * permission dialog) then asks the aggregator for a label and never reaches into
 * a family's renderer internals. Adding the Nth family is one registry line, not
 * a new `isXxxTool` branch scattered across general code.
 */
export interface McpToolNamer {
    /** True when this family owns `name` (e.g. a JetBrains launcher server). */
    matches(name: string): boolean;
    /** Full human label for "Allow <label>?" — e.g. "IntelliJ IDEA: Create new file". */
    label(name: string): string;
    /** Phrase for "Yes, allow all <…> this session" — e.g. `"Create new file"`. */
    sessionScopeLabel(name: string): string;
}

// dir="ltr": wraps raw JSON/code IN-OUT rows (JSON.stringify(input), tool
// output text) for every MCP renderer. Left mirrored, this content's
// punctuation/indentation would flip under `<html dir="rtl">`.
export const McpToolBody = (props: {children?: ReactNode}) => {
    const {children} = props;
    return (
        <div dir="ltr" className="mt-1.5 border border-border-subtle rounded text-[0.8461rem] font-mono overflow-hidden">
            {children}
        </div>
    );
};

interface CollapsibleBoxProps {
    children?: ReactNode;
    collapsedMaxHeight?: number;
    className?: string;
}

/**
 * Tailwind cannot statically extract class names built from runtime values, so
 * each supported `collapsedMaxHeight` maps to a fixed set of utility classes
 * (max-height clamp + bottom fade mask). `60` preserves McpToolRow's original
 * look; `200` suits longer list content such as a mail list.
 */
const collapsedHeightClasses: Record<number, string> = {
    60: "overflow-hidden max-h-[60px] [mask-image:linear-gradient(to_bottom,black_50px,transparent_60px)]",
    200: "overflow-hidden max-h-[200px] [mask-image:linear-gradient(to_bottom,black_185px,transparent_200px)]",
};

/**
 * Wraps arbitrary content and, when its natural height exceeds
 * `collapsedMaxHeight`, clips it with a bottom fade mask and reveals the full
 * content on click. The collapse/expand mechanism is shared by McpToolRow and
 * any renderer that needs a "click to expand" overflow region.
 */
export const CollapsibleBox = (props: CollapsibleBoxProps) => {
    const {children, collapsedMaxHeight = 60, className} = props;
    const contentRef = useRef<HTMLDivElement>(null);
    const [overflows, setOverflows] = useState(false);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (contentRef.current) {
            setOverflows(contentRef.current.scrollHeight > collapsedMaxHeight);
        }
    }, [children, collapsedMaxHeight]);

    const collapsedClass = collapsedHeightClasses[collapsedMaxHeight] ?? collapsedHeightClasses[60];

    return (
        <div
            ref={contentRef}
            className={cn(
                className,
                overflows && !expanded && collapsedClass,
                overflows && "cursor-pointer"
            )}
            onClick={overflows ? () => setExpanded((v) => !v) : undefined}
        >
            {children}
        </div>
    );
};

export const McpToolRow = (props: {label: string; children?: ReactNode}) => {
    const {label, children} = props;

    return (
        <div className="flex items-start gap-2 p-2 border-b border-border-subtle last:border-b-0">
            <span className="text-tool-label-fg uppercase text-[0.7692rem] min-w-[28px] pt-[1px]">
                {label}
            </span>
            <CollapsibleBox
                collapsedMaxHeight={60}
                className="monospace-block flex-1 text-text-primary/80 whitespace-pre overflow-x-auto no-scrollbar"
            >
                {children}
            </CollapsibleBox>
        </div>
    );
};
