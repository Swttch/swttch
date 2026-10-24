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

export function WriteRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as WriteToolUseDto;
    const filePath = toolUse.input?.file_path ?? '';
    const fileName = filePath.split('/').pop() ?? filePath;
    const lineCount = (toolUse.input?.content ?? '').split('\n').length;

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name="Write" inProgress={!props.toolResult && lineCount <= 0} className="mb-1">
                <div dir="ltr" className={cn("text-text-primary/80 text-[0.8461rem] font-mono", filePath && "cursor-pointer hover:underline")} onClick={filePath ? () => openChatFile(filePath) : undefined}>{fileName}</div>
            </ToolHeader>
            <div className="text-text-primary/50 text-[0.8461rem]">{t('write.lineCount', {count: lineCount})}</div>
        </ToolWrapper>
    );
}
