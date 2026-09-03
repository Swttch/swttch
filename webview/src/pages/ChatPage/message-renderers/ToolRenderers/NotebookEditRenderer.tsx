import {ToolUseBlockDto} from "@/dto";
import {getAdapter} from "@/adapters";
import {useTranslation} from "@/i18n";
import {Container, LabelValue, RendererProps, ToolHeader, ToolWrapper, isInputSettled} from "./common";
import {cn} from "@/utils/cn";

class NotebookEditToolUseDto extends ToolUseBlockDto {
    declare input: {
        notebook_path: string;
        cell_id?: string;
        edit_mode?: 'insert' | 'replace' | 'delete';
        cell_type?: 'code' | 'markdown';
        new_source: string;
    };
}

interface NotebookEditToolUseResult {
    new_source?: string;
    cell_type?: 'code' | 'markdown';
    language?: string;
    edit_mode?: 'insert' | 'replace' | 'delete';
    cell_id?: string;
    error?: string;
    notebook_path?: string;
}

export function NotebookEditRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const STATUS_LABEL_BY_MODE: Record<string, string> = {
        insert: t('notebookEdit.status.inserted'),
        replace: t('notebookEdit.status.replaced'),
        delete: t('notebookEdit.status.deleted'),
    };
    const toolUse = props.toolUse as unknown as NotebookEditToolUseDto;
    const result = props.toolResult?.toolUseResult as NotebookEditToolUseResult | undefined;

    const notebookPath = toolUse.input?.notebook_path ?? result?.notebook_path ?? '';
    const fileName = notebookPath.split('/').pop() ?? notebookPath;

    const editMode = result?.edit_mode ?? toolUse.input?.edit_mode ?? 'replace';
    const cellId = result?.cell_id ?? toolUse.input?.cell_id ?? '';
    const source = result?.new_source ?? toolUse.input?.new_source ?? '';
    const error = result?.error ?? '';

    const headerLocation = cellId ? `${fileName}:${cellId}` : fileName;
    const hasResult = !!props.toolResult;
    const isError = hasResult && !!error;

    let statusLabel = '';
    if (hasResult) {
        statusLabel = isError ? error : (STATUS_LABEL_BY_MODE[editMode] ?? t('notebookEdit.status.success'));
    }

    // An empty cell is a real thing to report, but a cell whose source is still
    // streaming in is not one — say nothing until the arguments have landed.
    const displaySource = source.length > 0
        ? source
        : isInputSettled(props) ? t('notebookEdit.noContent') : '';

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name={t('notebookEdit.title')} className="mb-[4px]" inProgress={!hasResult}>
                <div
                    dir="ltr"
                    className={cn(
                        "text-text-primary/80 text-[0.8461rem] font-mono",
                        notebookPath && "cursor-pointer hover:underline",
                    )}
                    onClick={notebookPath ? () => getAdapter().openFile(notebookPath) : undefined}
                >
                    {headerLocation}
                </div>
            </ToolHeader>

            {statusLabel && (
                <div className={cn(
                    "text-[0.8461rem] mb-1",
                    isError ? "text-state-error-fg" : "text-text-primary/50",
                )}>
                    {statusLabel}
                </div>
            )}

            <Container>
                <LabelValue maxHeight="max-h-[140px]">
                    <span className={source.length === 0 ? "text-text-primary/40 italic" : undefined}>
                        {displaySource}
                    </span>
                </LabelValue>
            </Container>
        </ToolWrapper>
    );
}
