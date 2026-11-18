import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {RendererProps, ToolWrapper, toolResultIsError, Container, LabelValue, ResultCaption} from "../../common";
import {JetBrainsToolHeader, JetBrainsResultError, Badge, inputProjectPath} from "./_shared";

class CreateNewFileToolUseDto extends ToolUseBlockDto {
    declare input: {pathInProject?: string; text?: string; overwrite?: boolean};
}

/**
 * `create_new_file`: header with the target file link and — when `overwrite` is
 * set — a loud "overwrites existing file" warning. The link is gated (plain text
 * until the call succeeds) only for genuinely-new files; with `overwrite:true`
 * the file already exists, so it's clickable immediately. Below the header, the
 * new file's content preview with a "N lines" caption (nothing on a decline /
 * error, which the shared result-error row handles instead).
 */
export function CreateNewFileRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as CreateNewFileToolUseDto;
    const input = toolUse.input ?? ({} as CreateNewFileToolUseDto['input']);
    const text = typeof input.text === 'string' ? input.text : '';
    const lineCount = text ? text.replace(/\n+$/, '').split('\n').length : 0;
    const isError = toolResultIsError(props.toolResult);

    return (
        <ToolWrapper message={props.message} groupClassName="pb-2.5">
            <JetBrainsToolHeader
                name={toolUse.name}
                path={input.pathInProject}
                projectPath={inputProjectPath(input)}
                gateOnCreate={!input.overwrite}
                extra={input.overwrite ? <Badge tone="warning">{t('jetbrains.createNewFile.overwritesExisting')}</Badge> : undefined}
                input={input as Record<string, unknown>}
            />
            {isError ? (
                <JetBrainsResultError toolResult={props.toolResult} />
            ) : (
                text && (
                    <>
                        <ResultCaption>{t('jetbrains.createNewFile.lineCount', {count: lineCount})}</ResultCaption>
                        <Container>
                            <LabelValue maxHeight="max-h-[10rem]">{text}</LabelValue>
                        </Container>
                    </>
                )
            )}
        </ToolWrapper>
    );
}
