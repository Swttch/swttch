import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {RendererProps, ToolWrapper, toolResultText, toolResultIsError, Container, LabelValue} from "../../common";
import {JetBrainsToolHeader, JetBrainsResultError, Badge, safeParseJson, inputProjectPath} from "./_shared";

class ExecuteRunConfigurationToolUseDto extends ToolUseBlockDto {
    declare input: {configurationName?: string; filePath?: string; line?: number};
}

interface ExecResult {
    output?: string;
    exitCode?: number;
}

/** `execute_run_configuration`: launched target + exit-code badge + output. */
export function ExecuteRunConfigurationRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const toolUse = props.toolUse as unknown as ExecuteRunConfigurationToolUseDto;
    const input = toolUse.input ?? {};
    const out = toolResultText(props.toolResult);
    const isError = toolResultIsError(props.toolResult);
    const parsed = safeParseJson<ExecResult>(out);
    const exitCode = parsed?.exitCode;
    const output = parsed?.output ?? (parsed ? '' : out);

    const extra = input.configurationName
        ? <span className="font-mono text-text-primary/60">{input.configurationName}</span>
        : input.line
            ? <span className="font-mono text-text-primary/60">:{input.line}</span>
            : undefined;

    return (
        <ToolWrapper
            message={props.message}
            groupClassName="pb-2.5"
            forceStatus={typeof exitCode === 'number' && exitCode !== 0 ? 'error' : undefined}
        >
            <JetBrainsToolHeader
                name={toolUse.name}
                path={input.filePath}
                projectPath={inputProjectPath(input)}
                extra={extra}
                input={input as Record<string, unknown>}
            />
            {isError ? (
                <JetBrainsResultError toolResult={props.toolResult} />
            ) : (
                <>
                    {typeof exitCode === 'number' && (
                        <div className="mt-1 mb-1">
                            <Badge tone={exitCode === 0 ? 'success' : 'error'}>{t('jetbrains.common.exitCode', {code: exitCode})}</Badge>
                        </div>
                    )}
                    {output && <Container><LabelValue maxHeight="max-h-[10rem]">{output}</LabelValue></Container>}
                </>
            )}
        </ToolWrapper>
    );
}
