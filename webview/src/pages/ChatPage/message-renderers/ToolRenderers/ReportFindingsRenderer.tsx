import {Fragment} from "react";
import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {RendererProps, ToolHeader, ToolWrapper, isInputSettled} from "./common";
import {cn} from "@/utils/cn.ts";
import {getAdapter} from "@/adapters";
import {useSessionContext} from "@/contexts/SessionContext";
import {resolveFilePath} from "../utils/tokenizeMessagePaths";

interface FindingDto {
    file?: string;
    line?: number;
    summary?: string;
    short_summary?: string;
    failure_scenario?: string;
    category?: string;
    verdict?: 'CONFIRMED' | 'PLAUSIBLE';
    outcome?: 'fixed' | 'skipped' | 'no_change_needed';
}

class ReportFindingsToolUseDto extends ToolUseBlockDto {
    declare input: {
        findings?: FindingDto[];
        level?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    };
}

/** Where the finding sits, as the clickable `file:line` form reviewers expect. */
function findingLocation(finding: FindingDto): string {
    if (!finding.file) return '';
    return typeof finding.line === 'number' ? `${finding.file}:${finding.line}` : finding.file;
}

export function ReportFindingsRenderer(props: RendererProps) {
    const {t} = useTranslation('chatTools');
    const {workingDirectory} = useSessionContext();
    const toolUse = props.toolUse as unknown as ReportFindingsToolUseDto;
    const rawFindings = toolUse.input?.findings;
    const findings = Array.isArray(rawFindings) ? rawFindings : [];
    const level = toolUse.input?.level ?? '';

    return (
        <ToolWrapper message={props.message}>
            <ToolHeader name="ReportFindings" inProgress={!props.toolResult} className="mb-2.5">
                <div className="flex items-center gap-1.5 min-w-0 text-text-primary/60">
                    {/* "No findings" is a claim about a finished review. Mid-stream
                        the array is simply not here yet, so say nothing until the
                        arguments have landed. */}
                    {(findings.length > 0 || isInputSettled(props)) && (
                        <span className="shrink-0">
                            {findings.length === 0
                                ? t('reportFindings.none')
                                : t('reportFindings.count', {count: findings.length})}
                        </span>
                    )}
                    {level && (
                        <span className="shrink-0 text-text-tertiary">
                            {t('reportFindings.level', {level})}
                        </span>
                    )}
                </div>
            </ToolHeader>

            {findings.length > 0 && (
                /*
                 * A grid, not a row per finding: `verdict` is only set when a
                 * verify pass ran, so a review can hand back a list where some
                 * findings carry one and some do not. Laid out per row, the ones
                 * without a verdict slide left and the column stops lining up.
                 * The `auto` tracks collapse to nothing when no finding has a
                 * verdict at all, so an inline-only review costs no empty gutter.
                 */
                <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-3 text-[0.8461rem]">
                    {findings.map((finding, index) => {
                        const location = findingLocation(finding);
                        // `summary` is the full sentence; `short_summary` is its
                        // compressed label for a narrow UI. The chat column is not
                        // narrow, so prefer the sentence and fall back to the label.
                        const statement = finding.summary || finding.short_summary || '';
                        const openAt = finding.file
                            ? () => getAdapter().openFile(
                                resolveFilePath(finding.file as string, workingDirectory),
                                finding.line,
                            )
                            : undefined;

                        return (
                            <Fragment key={index}>
                                <span
                                    className={cn(
                                        'mt-[1px] uppercase tracking-wide text-[0.7692rem]',
                                        finding.verdict === 'CONFIRMED'
                                            ? 'text-state-error-fg'
                                            : 'text-text-tertiary',
                                    )}
                                >
                                    {finding.verdict ?? ''}
                                </span>

                                <div className="min-w-0">
                                    {/* Not truncated: a finding the reader cannot finish
                                        reading sends them to the raw payload instead. */}
                                    {statement && (
                                        <div className="text-text-primary/80 whitespace-pre-wrap">{statement}</div>
                                    )}

                                    <div className="flex items-baseline gap-2 min-w-0">
                                        {location && (
                                            <span
                                                dir="ltr"
                                                className={cn(
                                                    'font-mono text-text-tertiary truncate',
                                                    openAt && 'cursor-pointer hover:underline',
                                                )}
                                                onClick={openAt}
                                            >
                                                {location}
                                            </span>
                                        )}
                                        {finding.category && (
                                            <span className="shrink-0 text-text-tertiary">{finding.category}</span>
                                        )}
                                    </div>

                                    {/* The concrete inputs-to-wrong-output line is the
                                        evidence for the finding — without it the card
                                        states a verdict the reader cannot check. */}
                                    {finding.failure_scenario && (
                                        <div className="mt-0.5 text-text-primary/50 whitespace-pre-wrap">
                                            {t('reportFindings.failureScenario', {scenario: finding.failure_scenario})}
                                        </div>
                                    )}
                                </div>

                                <span className="text-text-tertiary">
                                    {/* The outcome comes from the model, so a value
                                        outside the schema would otherwise put the raw
                                        translation key on screen. Fall back to what was
                                        actually reported. */}
                                    {finding.outcome
                                        ? t(`reportFindings.outcome.${finding.outcome}`, {defaultValue: finding.outcome})
                                        : ''}
                                </span>
                            </Fragment>
                        );
                    })}
                </div>
            )}
        </ToolWrapper>
    );
}
