import toast from 'react-hot-toast';
import { getAdapter } from '@/adapters';
import { i18n } from '@/i18n';
import { copyFrontendLogs } from '@/utils/copyFrontendLogs';
import { StaticItem } from '../../types';
import { enKeyword } from '../../enKeyword';

/**
 * Built on demand (not a module-eval constant) so the labels and confirm-dialog
 * copy resolve against the current locale after i18n init. Called once when the
 * registry registers the Support section.
 */
export const getSupportItems = (): StaticItem[] => [
  // Bug-report aid: hands over this tab's whole front-end console log in one go.
  // `LogForwarder` captures it from startup, so this works for a user who never
  // opened devtools. Search-only — it is a diagnostics tool, not a daily action.
  new StaticItem('copy-front-log', i18n.t('commandPalette:support.copyFrontLog'), {
    disabled: false,
    searchOnly: true,
    keywords: [enKeyword('commandPalette:support.copyFrontLog')],
    action: async () => {
      const { ok, lineCount } = await copyFrontendLogs();
      if (ok) {
        toast.success(i18n.t('commandPalette:support.copyFrontLogDone', { count: lineCount }));
      } else {
        toast.error(i18n.t('commandPalette:support.copyFrontLogFailed'));
      }
    },
  }),
  new StaticItem('help-docs', i18n.t('commandPalette:support.viewHelpDocs'), {
    disabled: false,
    keywords: [enKeyword('commandPalette:support.viewHelpDocs')],
    action: async () => {
      await getAdapter().openUrl('https://docs.anthropic.com/en/docs/claude-code/overview');
    },
  }),
  new StaticItem('restart-plugin', i18n.t('commandPalette:support.restartPlugin'), {
    disabled: false,
    keywords: [enKeyword('commandPalette:support.restartPlugin')],
    serviceAction: async (services) => {
      const ok = await services.ui.confirm({
        title: i18n.t('commandPalette:support.restartConfirm.title'),
        message: i18n.t('commandPalette:support.restartConfirm.message'),
        confirmLabel: i18n.t('commandPalette:support.restartConfirm.confirmLabel'),
        variant: 'danger',
      });
      if (ok) await getAdapter().restartBackend();
    },
  }),
];
