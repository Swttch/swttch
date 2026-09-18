import {useSettings} from '@/contexts/SettingsContext';
import {useClaudeSettings} from '@/contexts/ClaudeSettingsContext';
import {useWorkingDir} from '@/contexts/WorkingDirContext';
import {SegmentedControl} from '@/components/SegmentedControl';
import {useTranslation} from '@/i18n';

type Scope = 'global' | 'project';

/**
 * Which file every setting on this screen is read from and written to.
 *
 * Drawn as a segmented control rather than as tabs attached to a rule. Tabs say
 * "these are two pages"; this is one page whose settings land in one of two
 * places, and the rule under them was the last horizontal line left on a screen
 * that now separates its areas by surface instead.
 */
export function ScopeTabs() {
    const {scope, setScope} = useSettings();
    const {setScope: setClaudeScope} = useClaudeSettings();
    const {workingDirectory} = useWorkingDir();
    const {t} = useTranslation('settings');

    const handleScopeChange = (newScope: Scope) => {
        setScope(newScope);
        setClaudeScope(newScope);
    };

    // The short labels are not abbreviations of the long ones for their own
    // sake: in a narrow tool window the pair of full labels is wider than the
    // column, and a segmented control that wraps stops reading as one control.
    const label = (long: string, short: string) => (
        <>
            <span className="max-xs:hidden">{long}</span>
            <span className="hidden max-xs:inline">{short}</span>
        </>
    );

    return (
        <div className="mb-6">
            <SegmentedControl<Scope>
                label={t('scope.label')}
                value={scope}
                onChange={handleScopeChange}
                options={[
                    {
                        value: 'global',
                        label: label(t('scope.global'), t('scope.globalShort')),
                    },
                    {
                        value: 'project',
                        label: label(t('scope.project'), t('scope.projectShort')),
                        disabled: !workingDirectory,
                        disabledReason: t('scope.projectDisabledTooltip'),
                    },
                ]}
            />
        </div>
    );
}
