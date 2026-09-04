import {ReactNode} from "react";
import {useTranslation} from "@/i18n";
import {RendererProps, ToolWrapper, toolResultText, toolResultIsError} from "../../common";
import {
    JetBrainsToolHeader, JetBrainsResultError, JetBrainsFileLink, FileList, Badge,
    getToolSpec, jetbrainsToolSuffix, inputProjectPath, isTrivialResult, prettyResult,
    resultIndicatesError, debuggerOutcome, debuggerHasExtraPayload, DebuggerOutcomeRow, OutBlock, OutLabel,
} from "./_shared";

type DiffLineType = 'add' | 'del' | 'ctx';

interface DiffLine {
    type: DiffLineType;
    content: string;
}

interface PatchFile {
    file: string;
    moveTo?: string;
    op: 'update' | 'add' | 'delete';
    lines: DiffLine[];
}

const lineStyles: Record<DiffLineType, string> = {
    add: 'bg-state-success-bg text-state-success-fg',
    del: 'bg-state-error-bg text-state-error-fg',
    ctx: 'text-text-secondary',
};
const prefixMap: Record<DiffLineType, string> = {add: '+', del: '-', ctx: ' '};

/**
 * Parse an apply_patch payload into per-file sections, keeping context lines.
 * Handles both the codex "*** Update/Add/Delete File:" format and a plain
 * unified diff (`+++ b/<path>`, ` `/`+`/`-` lines).
 */
function parseApplyPatch(patch: string): PatchFile[] {
    const out: PatchFile[] = [];
    let cur: PatchFile | null = null;

    for (const raw of patch.split('\n')) {
        const fileHeader = raw.match(/^\*\*\* (Update|Add|Delete) File: (.+)$/);
        if (fileHeader) {
            const op = fileHeader[1].toLowerCase() as PatchFile['op'];
            cur = {file: fileHeader[2].trim(), op, lines: []};
            out.push(cur);
            continue;
        }
        const moveHeader = raw.match(/^\*\*\* Move to: (.+)$/);
        if (moveHeader && cur) {
            cur.moveTo = moveHeader[1].trim();
            continue;
        }
        if (raw.startsWith('*** ')) continue; // Begin/End Patch and other markers

        const plusHeader = raw.match(/^\+\+\+ (?:b\/)?(.+)$/);
        if (plusHeader) {
            const f = plusHeader[1].trim();
            if (f !== '/dev/null') {
                cur = {file: f, op: 'update', lines: []};
                out.push(cur);
            }
            continue;
        }
        if (raw.startsWith('--- ') || raw.startsWith('diff --git') || raw.startsWith('index ')) continue;
        if (raw.startsWith('@@')) continue; // hunk header

        if (!cur) continue;
        if (raw.startsWith('+')) cur.lines.push({type: 'add', content: raw.slice(1)});
        else if (raw.startsWith('-')) cur.lines.push({type: 'del', content: raw.slice(1)});
        else if (raw.startsWith(' ')) cur.lines.push({type: 'ctx', content: raw.slice(1)});
    }

    return out.filter((f) => f.lines.length > 0 || f.op !== 'update');
}

interface PatchViewProps {
    patch: string;
    projectPath?: string;
}

function PatchView(props: PatchViewProps) {
    const {t} = useTranslation('chatTools');
    const {patch, projectPath} = props;
    const files = parseApplyPatch(patch);
    if (!files.length) return null;

    return (
        <div className="mt-1.5 flex flex-col gap-2">
            {files.map((f, fi) => (
                <div key={fi}>
                    <div className="flex items-center gap-1.5 mb-1 text-[0.8461rem]">
                        <Badge tone={f.op === 'add' ? 'success' : f.op === 'delete' ? 'error' : 'default'}>
                            {t(`jetbrains.action.patchOp.${f.op}`, {defaultValue: f.op})}
                        </Badge>
                        <JetBrainsFileLink
                            path={f.file}
                            label={f.moveTo ? `${f.file} → ${f.moveTo}` : undefined}
                            projectPath={projectPath}
                            gateOnCreate={f.op === 'add'}
                        />
                    </div>
                    {f.lines.length > 0 && (
                        <div className="rounded overflow-hidden border border-border-default">
                            <pre dir="ltr" className="text-[0.9230rem] leading-[1.5] font-mono overflow-x-auto m-0">
                                {f.lines.map((l, i) => (
                                    <div key={i} className={lineStyles[l.type]}>
                                        <span className="inline-flex items-center justify-center w-4 select-none bg-surface-pressed/20">
                                            {prefixMap[l.type]}
                                        </span>
                                        {l.content}
                                    </div>
                                ))}
                            </pre>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

/**
 * Shared renderer for JetBrains "action" tools whose value is the action and its
 * target rather than a large result body (open/reformat/rename + most debugger
 * commands). All field bindings come from the tool spec (`tool-params.ts`), so
 * the header always shows the real target: a file link (+ `:line`), a value
 * navigation path (`a › b`), a rename (`old → new`), a run-config name, or the
 * control-session action. `apply_patch` renders a full per-file diff. Any
 * non-trivial result text is shown so the outcome (paused/stopped, old→new,
 * removed) stays visible.
 */
export function JetBrainsActionRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const {toolUse, toolResult, message} = props;
    const input = (toolUse.input ?? {}) as Record<string, unknown>;
    const suffix = jetbrainsToolSuffix(toolUse.name);
    const spec = getToolSpec(toolUse.name);
    const projectPath = inputProjectPath(input);
    const isError = toolResultIsError(toolResult);
    const out = toolResultText(toolResult);

    // apply_patch's diff is a string; a non-string (model slip / schema drift) must
    // not reach PatchView → parseApplyPatch(...).split('\n'), which would throw.
    const rawPatch = suffix === 'apply_patch' ? (input.input ?? input.patch) : undefined;
    const patch = typeof rawPatch === 'string' ? rawPatch : '';
    const files = spec?.filesParam && Array.isArray(input[spec.filesParam])
        ? (input[spec.filesParam] as unknown[]).filter((f): f is string => typeof f === 'string')
        : [];

    const file = spec?.fileParam && typeof input[spec.fileParam] === 'string'
        ? (input[spec.fileParam] as string) : undefined;
    const line = spec?.lineParam && typeof input[spec.lineParam] === 'number'
        ? (input[spec.lineParam] as number) : undefined;
    const segments = spec?.segmentsParam && Array.isArray(input[spec.segmentsParam])
        ? (input[spec.segmentsParam] as unknown[]).map(String) : undefined;
    const newValue = spec?.newValueParam ? input[spec.newValueParam] : undefined;
    const configName = spec?.configParam && typeof input[spec.configParam] === 'string'
        ? (input[spec.configParam] as string) : undefined;
    const rename = suffix === 'rename_refactoring'
        ? `${input.symbolName ?? ''} → ${input.newName ?? ''}` : undefined;
    // control_session puts its action (RESUME/STOP/STEP_OVER/…) into the title.
    const action = suffix === 'xdebug_control_session' && typeof input.action === 'string'
        ? t('jetbrains.action.debuggerAction', {action: input.action}) : undefined;

    const extraParts: ReactNode[] = [];
    if (file && line != null) extraParts.push(<span key="line" className="text-text-primary/50 shrink-0">:{line}</span>);
    if (!file && line != null) extraParts.push(<span key="line" className="text-text-primary/50 shrink-0">{t('jetbrains.action.line', {line})}</span>);
    if (rename) extraParts.push(<span key="rn" dir="ltr" className="font-mono text-text-primary/70 truncate">{rename}</span>);
    if (segments) extraParts.push(
        <span key="seg" dir="ltr" className="font-mono text-text-primary/70 truncate">
            {segments.join(' › ')}{newValue !== undefined ? ` = ${String(newValue)}` : ''}
        </span>,
    );
    if (configName) extraParts.push(<span key="cfg" dir="ltr" className="font-mono text-text-primary/70 truncate">{configName}</span>);
    const extra = extraParts.length ? <span className="flex items-center gap-1.5 min-w-0">{extraParts}</span> : undefined;

    // Debugger ops: show a compact outcome (status / old→new / applied / message)
    // rather than raw JSON — the IDE's own debugger panel is the rich view. But
    // when the result carries extra content (e.g. DRAIN_EVENTS' buffered events),
    // fall through to the full JSON so that content isn't hidden.
    const outcome = !isError && !patch && !files.length && !debuggerHasExtraPayload(out)
        ? debuggerOutcome(out) : null;

    return (
        <ToolWrapper
            message={message}
            groupClassName="pb-2.5"
            forceStatus={resultIndicatesError(out) ? 'error' : undefined}
        >
            <JetBrainsToolHeader
                name={toolUse.name}
                action={action}
                path={patch || files.length ? undefined : file}
                projectPath={projectPath}
                extra={extra}
                input={input}
            />
            {isError ? (
                <JetBrainsResultError toolResult={toolResult} />
            ) : patch ? (
                <PatchView patch={patch} projectPath={projectPath} />
            ) : files.length ? (
                <FileList files={files} projectPath={projectPath} />
            ) : outcome ? (
                <OutLabel><DebuggerOutcomeRow outcome={outcome} /></OutLabel>
            ) : out && !isTrivialResult(out) ? (
                <OutBlock>{prettyResult(out)}</OutBlock>
            ) : null}
        </ToolWrapper>
    );
}
