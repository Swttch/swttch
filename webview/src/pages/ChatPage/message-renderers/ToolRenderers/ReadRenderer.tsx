import {openChatFile} from "@/utils/openChatFile";
import {ToolUseBlockDto} from "@/types";
import {cn} from "@/utils/cn";
import {RendererProps, ToolHeader, ToolWrapper, toolResultImages} from "./common";

class ReadToolUseDto extends ToolUseBlockDto {
    caller: { type: 'direct' };
    declare input: {
        file_path: string;
    };
}

export function ReadRenderer(props: RendererProps) {
    const toolUse = props.toolUse as unknown as ReadToolUseDto;
    // A picture the CLI read comes back as an image block; Claude Desktop draws it
    // under the row at the width of the message, so the reader sees what Claude saw.
    const images = toolResultImages(props.toolResult);

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
            {images.map((src, index) => (
                <img
                    key={index}
                    src={src}
                    alt={fileName}
                    className="mt-1.5 mb-1 block max-w-full rounded-md"
                />
            ))}
        </ToolWrapper>
    )
}
