import {ToolUseBlockDto} from "@/dto";
import {useTranslation} from "@/i18n";
import {RendererProps, ToolHeader, ToolWrapper, isInputSettled} from "./common";
import {cn} from "@/utils/cn.ts";

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
                <div className="flex flex-col gap-1.5">
                    {findings.map((finding, index) => {
                        const location = findingLocation(finding);
                        const text = finding.short_summary || finding.summary || '';
                        return (
                            <div key={index} className="flex items-start gap-2 text-[0.8461rem] min-w-0">
                                {finding.verdict && (
                                    <span
                                        className={cn(
                                            'shrink-0 mt-[1px] uppercase tracking-wide text-[0.7692rem]',
                                            finding.verdict === 'CONFIRMED'
                                                ? 'text-state-error-fg'
                                                : 'text-text-tertiary',
                                        )}
                                    >
                                        {finding.verdict}
                                    </span>
                                )}
                                <div className="min-w-0 flex-1">
                                    {text && <div className="text-text-primary/80 truncate">{text}</div>}
                                    {location && (
                                        <div dir="ltr" className="font-mono text-text-tertiary truncate">
                                            {location}
                                        </div>
                                    )}
                                </div>
                                {finding.outcome && (
                                    <span className="shrink-0 text-text-tertiary">
                                        {/* The outcome comes from the model, so a value
                                            outside the schema would otherwise put the raw
                                            translation key on screen. Fall back to what was
                                            actually reported. */}
                                        {t(`reportFindings.outcome.${finding.outcome}`, {defaultValue: finding.outcome})}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </ToolWrapper>
    );
}
