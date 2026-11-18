import {useTranslation} from "@/i18n";
import {RendererProps, ToolWrapper, toolResultText, toolResultIsError, Container, LabelValue} from "../../common";
import {JetBrainsToolHeader, JetBrainsResultError, Badge, RawJsonResult, headerFilePath, inputProjectPath, isTrivialResult} from "./_shared";

/**
 * `replace_text_in_file`: a clickable file link plus the old -> new text, so the
 * exact change is visible before approval (a replace mutates file content). The
 * `caseSensitive` / `replaceAll` options are shown as compact flags. Any
 * meaningful result text is shown; a trivial "ok" is left to the status dot.
 */
export function ReplaceTextRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const {toolUse, toolResult, message} = props;
    const input = (toolUse.input ?? {}) as Record<string, unknown>;
    const oldText = typeof input.oldText === 'string' ? input.oldText : '';
    const newText = typeof input.newText === 'string' ? input.newText : '';
    const isError = toolResultIsError(toolResult);
    const out = toolResultText(toolResult);

    const flags = [
        input.replaceAll === true && <Badge key="all">{t('jetbrains.replaceText.all')}</Badge>,
        input.caseSensitive === true && <Badge key="cs">{t('jetbrains.replaceText.caseSensitive')}</Badge>,
    ].filter(Boolean);

    return (
        <ToolWrapper message={message} groupClassName="pb-2.5">
            <JetBrainsToolHeader
                name={toolUse.name}
                path={headerFilePath(toolUse.name, input)}
                projectPath={inputProjectPath(input)}
                extra={flags.length ? <span className="flex items-center gap-1.5">{flags}</span> : undefined}
                input={input}
            />
            {isError ? (
                <JetBrainsResultError toolResult={toolResult} />
            ) : (
                <div className="mt-1.5 flex flex-col gap-1">
                    <Container>
                        <LabelValue label={t('jetbrains.replaceText.old')} maxHeight="max-h-[7.5rem]">{oldText}</LabelValue>
                    </Container>
                    <Container>
                        <LabelValue label={t('jetbrains.replaceText.new')} maxHeight="max-h-[7.5rem]">{newText}</LabelValue>
                    </Container>
                    {out && !isTrivialResult(out) && <RawJsonResult out={out} />}
                </div>
            )}
        </ToolWrapper>
    );
}
