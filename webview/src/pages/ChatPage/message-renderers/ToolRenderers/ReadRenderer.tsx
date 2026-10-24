import {openChatFile} from "@/utils/openChatFile";
import {ToolUseBlockDto} from "@/types";
import {cn} from "@/utils/cn";
import {RendererProps, ToolHeader, ToolWrapper} from "./common";

class ReadToolUseDto extends ToolUseBlockDto {
    caller: { type: 'direct' };
    declare input: {
        file_path: string;
    };
}

export function ReadRenderer(props: RendererProps) {
    const toolUse = props.toolUse as unknown as ReadToolUseDto;
    // const toolResult = props.toolResult as BashToolResultDto | undefined;

    const name = toolUse.name;
    const path = toolUse.input?.file_path ?? '';
    const fileName = path.split('/').reverse()[0];
    // const output = toolResult?.message?.content[0].content ?? '' as string;

    return (
        <ToolWrapper message={props.message} groupClassName="pb-2.5">
            <ToolHeader name={name}>
                <div
                    dir="ltr"
                    className={cn("text-text-primary/80 text-[0.9230rem] font-mono", path && "cursor-pointer hover:underline")}
                    onClick={path ? () => openChatFile(path) : undefined}
                >{fileName}</div>
            </ToolHeader>
        </ToolWrapper>
    )
}
