import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { KeyCaps } from './KeyCaps';
import {
  SHORTCUT_GROUPS,
  visibleShortcuts,
  type ShortcutContext,
} from './shortcutCatalog';

interface ShortcutsTabProps {
  context: ShortcutContext;
}

/** The "Shortcuts" tab: every shortcut that is true on this machine, by group. */
export function ShortcutsTab(props: ShortcutsTabProps) {
  const { context } = props;
  const { t } = useTranslation('common');
  const rows = useMemo(() => visibleShortcuts(context), [context]);

  return (
    <div className="space-y-6">
      {SHORTCUT_GROUPS.map((meta) => {
        const groupRows = rows.filter((row) => row.group === meta.group);
        if (groupRows.length === 0) return null;

        return (
          <section key={meta.group} aria-label={t(meta.titleKey)}>
            <div className="text-[0.9230rem] font-bold text-text-secondary uppercase tracking-widest mb-1">
              {t(meta.titleKey)}
            </div>
            {meta.noteKey && (
              <p className="text-xs text-text-tertiary mb-2">{t(meta.noteKey)}</p>
            )}
            <ul>
              {groupRows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-4 py-1.5 border-b border-border-default/50 last:border-b-0"
                >
                  <span className="text-sm text-text-primary">{t(row.descriptionKey)}</span>
                  <span className="flex-shrink-0">
                    <KeyCaps combos={row.combos} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
