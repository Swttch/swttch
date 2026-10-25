import {ToolUseBlockDto} from "@/dto";
import {openChatFile} from "@/utils/openChatFile";
import {useTranslation} from "@/i18n";
import {RendererProps, ToolHeader, ToolWrapper} from "./common";
import {cn} from "@/utils/cn";

class WriteToolUseDto extends ToolUseBlockDto {
    declare input: {
        file_path: string;
        content: string;
    };
}

/** The lines shown of a written file: a long file is a window onto its start, with the real count in the caption. */
const MAX_SHOWN_LINES = 200;

export function WriteRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as WriteToolUseDto;
    const filePath = toolUse.input?.file_path ?? '';
    const fileName = filePath.split('/').pop() ?? filePath;
    const content = toolUse.input?.content ?? '';
    const lines = content === '' ? [] : content.replace(/\n$/, '').split('\n');
    const lineCount = content.split('\n').length;
    const shown = lines.slice(0, MAX_SHOWN_LINES);
    const gutterDigits = String(shown.length).length;

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name="Write" inProgress={!props.toolResult && lineCount <= 0} className="mb-1">
                <div dir="ltr" className={cn("text-text-primary/80 text-[0.8461rem] font-mono", filePath && "cursor-pointer hover:underline")} onClick={filePath ? () => openChatFile(filePath) : undefined}>{fileName}</div>
            </ToolHeader>
            <div className="text-text-primary/50 text-[0.8461rem]">{t('write.lineCount', {count: lineCount})}</div>
            {shown.length > 0 && (
                // The file as Claude Desktop shows a created file when its row is open: every line added, numbered.
                <div className="mt-2.5 max-h-[220px] overflow-y-auto rounded border border-border-default">
                    <pre dir="ltr" className="m-0 overflow-x-auto font-mono text-[0.9230rem] leading-[1.5]">
                        <div className="diff-body">
                            {shown.map((line, i) => (
                                <div key={i} className="diff-body-line bg-state-success-bg text-state-success-fg">
                                    <span className="inline-block select-none pr-2 text-right opacity-60" style={{minWidth: `${gutterDigits + 1}ch`}}>{i + 1}</span>
                                    <div className="inline-flex w-4 select-none items-center justify-center bg-surface-pressed/20">+</div>
                                    {line}
                                </div>
                            ))}
                        </div>
                    </pre>
                </div>
            )}
        </ToolWrapper>
    );
}
