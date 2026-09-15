import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import {useUsageData} from "@/pages/SettingsPage/Usage/useUsageData";
import { CcbNotInstalledNotice } from '@/pages/SettingsPage/Usage/CcbNotInstalledNotice';
import { SectionLabel } from '../SectionLabel';
import { SkeletonRow } from '../SkeletonRow';
import { UsageRow } from '../UsageRow';
import { formatRelativeTime } from '../formatters';
import { scopedWindows } from '../scopedWindows';
import { useAccountData } from '../useAccountData';

interface Props {
    //
}

export const UsageSection = (props: Props) => {
    const {} = props;
    const { t } = useTranslation('common');
    const { data: usageData, isLoading: usageLoading, error: usageError, errorKind: usageErrorKind, lastUpdated, refresh } = useUsageData();
    const { data: accountData } = useAccountData();

    /**
     * A credential from an environment variable is an API-key account, and the API has
     * no subscription windows to report for one: it answers "usage limits are not
     * applicable to API organizations". Drawing an empty five-hour bar there would be a
     * guess dressed up as a measurement, so the section says so in the same muted tone
     * an empty list uses rather than in the red one an error uses.
     */
    const apiKeyMode = Boolean(accountData?.apiKeySource);
    const modelScoped = scopedWindows(usageData);

    return (
        <div>
            <SectionLabel className="flex items-center justify-between">
                <div>{t('usageSection.title')}</div>

                <div className="flex items-center gap-2 text-[0.8461rem] text-text-tertiary normal-case font-[400] hover:text-text-primary transition-all">
                    {lastUpdated && <span>{t('usageSection.updated', { time: formatRelativeTime(lastUpdated) })}</span>}
                    <button
                        onClick={refresh}
                        disabled={usageLoading}
                        className="p-1 rounded hover:bg-surface-hover transition-colors disabled:opacity-40"
                        title={t('usageSection.refresh')}
                    >
                        <ArrowPathIcon className={`w-3 h-3 ${usageLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </SectionLabel>

            {apiKeyMode ? (
                <p className="text-xs text-text-tertiary">
                    {t('usageSection.notApplicableForApiKey', { source: accountData?.apiKeySource })}
                </p>
            ) : usageError && usageErrorKind === 'ccb_missing' ? (
                <CcbNotInstalledNotice onRetry={refresh} isLoading={usageLoading} />
            ) : usageError ? (
                <p className="text-xs text-state-error-fg mb-2">{usageError}</p>
            ) : null}

            {/*
              In API-key mode the notice above is the whole answer. Drawing bars under it
              would contradict it: whatever numbers a previous subscription login left in
              the store are not this credential's, and the API has none to offer for it.
            */}
            {apiKeyMode ? null : usageLoading && !usageData ? (
                <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                </>
            ) : usageData ? (
                <>
                    {usageData.five_hour && (
                        <UsageRow
                            label={t('usageSection.session5hr')}
                            utilization={usageData.five_hour.utilization}
                            resetsAt={usageData.five_hour.resets_at}
                        />
                    )}
                    {usageData.seven_day && (
                        <UsageRow
                            label={t('usageSection.weekly7day')}
                            utilization={usageData.seven_day.utilization}
                            resetsAt={usageData.seven_day.resets_at}
                        />
                    )}
                    {usageData.seven_day_sonnet && (
                        <UsageRow
                            label={t('usageSection.weeklySonnet')}
                            utilization={usageData.seven_day_sonnet.utilization}
                            resetsAt={usageData.seven_day_sonnet.resets_at}
                        />
                    )}
                    {usageData.seven_day_opus && (
                        <UsageRow
                            label={t('usageSection.weeklyOpus')}
                            utilization={usageData.seven_day_opus.utilization}
                            resetsAt={usageData.seven_day_opus.resets_at}
                        />
                    )}
                    {/*
                      Per-model weekly windows arrive only in the `limits` array, so they
                      are drawn from there rather than from a named field. Their labels
                      come from the API, which is what lets a model the plugin has never
                      heard of show up without a release.
                    */}
                    {modelScoped.map((window) => (
                        <UsageRow
                            key={window.label}
                            label={t('usageSection.weeklyModel', { model: window.label })}
                            utilization={window.utilization}
                            resetsAt={window.resetsAt ?? ''}
                        />
                    ))}
                </>
            ) : null}
        </div>
    )
}