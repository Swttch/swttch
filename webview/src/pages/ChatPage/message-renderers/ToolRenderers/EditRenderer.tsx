import {useMemo, useRef, useState, useEffect} from "react";
import {ToolUseBlockDto} from "@/types";
import {getAdapter} from "@/adapters";
import {useTranslation} from "@/i18n";
import {RendererProps, ResultCaption, ToolHeader, ToolWrapper} from "./common";
import {cn} from "@/utils/cn";
// @ts-ignore
import {diffAsText} from "unidiff";

class EditToolUseDto extends ToolUseBlockDto {
    caller: { type: 'direct' };
    declare input: {
        file_path: string;
        old_string: string;
        new_string: string;
    };
}

interface StructuredPatch {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
}

interface EditToolUseResult {
    structuredPatch?: StructuredPatch[];
}

enum DiffLineType {
    Add = 'add',
    Delete = 'delete',
    Context = 'context',
}

interface DiffLine {
    type: DiffLineType;
    content: string;
}

function parseLine(line: string): DiffLine {
    if (line.startsWith('+')) return {type: DiffLineType.Add, content: line.slice(1)};
    if (line.startsWith('-')) return {type: DiffLineType.Delete, content: line.slice(1)};
    return {type: DiffLineType.Context, content: line.startsWith(' ') ? line.slice(1) : line};
}

function fromStructuredPatch(patches: StructuredPatch[]): DiffLine[] {
    return patches.flatMap((patch) => patch.lines.map(parseLine));
}

function fromDiffText(diffText: string): DiffLine[] {
    return diffText.split('\n')
        .filter((line) => !line.startsWith('---') && !line.startsWith('+++') && !line.startsWith('@@'))
        .map(parseLine);
}

const lineStyles: Record<DiffLineType, string> = {
    [DiffLineType.Add]: 'bg-state-success-bg text-state-success-fg',
    [DiffLineType.Delete]: 'bg-state-error-bg text-state-error-fg',
    [DiffLineType.Context]: 'text-text-secondary',
};

const prefixMap: Record<DiffLineType, string> = {
    [DiffLineType.Add]: '+',
    [DiffLineType.Delete]: '-',
    [DiffLineType.Context]: ' ',
};

export function EditRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as EditToolUseDto;
    const name = toolUse.name;
    const path = toolUse.input?.file_path ?? '';
    const fileName = path.split('/').reverse()[0];
    const oldString = toolUse.input?.old_string ?? '';
    const newString = toolUse.input?.new_string ?? '';
    const result = props.toolResult?.toolUseResult as EditToolUseResult | undefined;

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState<number>(0);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        observer.observe(el);
        setContainerWidth(el.getBoundingClientRect().width);

        return () => observer.disconnect();
    }, []);

    const diffLines = useMemo(() => {
        const patches = result?.structuredPatch;
        if (Array.isArray(patches) && patches.length > 0) {
            return fromStructuredPatch(patches);
        }
        if (!oldString && !newString) return [];
        try {
            const text = diffAsText(oldString, newString, {context: 3}) as string;
            if (!text) return [];
            return fromDiffText(text);
        } catch {
            return [];
        }
    }, [result, oldString, newString]);

    const showDiff = containerWidth >= 400 && diffLines.length > 0;

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name={name} className="mb-[4px]" inProgress={!props.toolResult}>
                <div dir="ltr" className={cn("text-text-primary/80 text-[0.8461rem] font-mono", path && "cursor-pointer hover:underline")} onClick={path ? () => getAdapter().openFile(path) : undefined}>{fileName}</div>
            </ToolHeader>
            <div ref={containerRef}>
                <ResultCaption>{t('edit.modified')}</ResultCaption>

                {showDiff && (
                    <div className="rounded overflow-hidden border border-border-default mt-2.5">
                        <pre dir="ltr" className="text-[0.9230rem] leading-[1.5] font-mono overflow-x-auto m-0">
                            {/* Sized to the longest line rather than to the visible width, so the
                                rows inside can fill it. A row is a block, so its width resolves
                                against this box — without it every row stops at the container's
                                edge and its tint runs out mid-line once scrolled (#179). */}
                            <div className="diff-body">
                                {diffLines.map((line, i) => (
                                    <div key={i} className={`diff-body-line ${lineStyles[line.type]}`}>
                                        <div className={`${prefixMap[line.type].trim() ? 'inline-flex' : 'inline-block'} items-center justify-center w-4 select-none bg-surface-pressed/20`}>{prefixMap[line.type]}</div>
                                        {line.content}
                                    </div>
                                ))}
                            </div>
                        </pre>
                    </div>
                )}
            </div>
        </ToolWrapper>
    );
}
