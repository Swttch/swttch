import {ToolUseBlockDto, ImageBlockDto, ContentBlockType} from "@/dto";
import {getAdapter} from "@/adapters";
import {cn} from "@/utils/cn";
import {useTranslation} from "@/i18n";
import {RendererProps, ToolHeader, ToolWrapper} from "../../common";
import {McpToolBody, McpToolRow} from "../_common";

class ReadMediaFileToolUseDto extends ToolUseBlockDto {
    declare input: {
        path: string;
    };
}

function extractImageBlock(props: RendererProps): ImageBlockDto | null {
    const blocks = props.toolResult?.message?.content;
    if (!Array.isArray(blocks)) return null;
    const first = blocks[0];
    if (first && (first as {type?: string}).type === ContentBlockType.Image) {
        return first as ImageBlockDto;
    }
    return null;
}

function extractTextContent(props: RendererProps): string {
    const blocks = props.toolResult?.message?.content;
    if (!Array.isArray(blocks) || blocks.length === 0) return '';
    const first = blocks[0];
    const c = (first as {content?: unknown}).content;
    return typeof c === 'string' ? c : '';
}

export function ReadMediaFileRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const {toolUse: rawToolUse, toolResult} = props;
    const toolUse = rawToolUse as unknown as ReadMediaFileToolUseDto;
    const name = toolUse.name;
    const path = toolUse.input?.path ?? '';
    const fileName = path.split('/').reverse()[0];
    const input = toolUse.input ?? {};

    const imageBlock = extractImageBlock(props);
    const textContent = imageBlock ? '' : extractTextContent(props);
    const hasResult = toolResult !== undefined && toolResult !== null;

    return (
        <ToolWrapper message={props.message} groupClassName="pb-2.5">
            <ToolHeader name={name}>
                <div
                    dir="ltr"
                    className={cn(
                        "text-text-link text-[0.9230rem] font-mono",
                        path && "cursor-pointer hover:underline"
                    )}
                    onClick={path ? () => getAdapter().openFile(path) : undefined}
                >
                    {fileName}
                </div>
            </ToolHeader>

            <McpToolBody>
                <McpToolRow label={t('filesystem.common.in')}>
                    {JSON.stringify(input, null, 2)}
                </McpToolRow>
                {hasResult && (
                    <McpToolRow label={t('filesystem.common.out')}>
                        {imageBlock ? (
                            <div>
                                <img
                                    src={`data:${imageBlock.source.media_type};base64,${imageBlock.source.data}`}
                                    alt=""
                                    className="max-h-[12.5rem] max-w-full object-contain"
                                />
                                <div className="text-text-primary/50 text-[0.7692rem]">
                                    {imageBlock.source.media_type}
                                </div>
                            </div>
                        ) : textContent}
                    </McpToolRow>
                )}
            </McpToolBody>
        </ToolWrapper>
    );
}
