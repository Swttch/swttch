import { IconType } from '@/types/commandPalette';
import { i18n } from '@/i18n';
import { StaticItem } from '../../types';
import { enKeyword } from '../../enKeyword';
import { confirmAndOpenSessionInDesktop } from '@/hooks/useOpenSessionInDesktop';
import toast from 'react-hot-toast';

export const OPEN_MCP_MODAL_EVENT = 'open-mcp-modal';

/**
 * Built on demand (not a module-eval constant) so the labels resolve against
 * the current locale after i18n init. Called once when the registry registers
 * the Customize section.
 */
export const getCustomizeItems = (): StaticItem[] => [
  new StaticItem('output-styles', i18n.t('commandPalette:customize.outputStyles'), {
    keywords: [enKeyword('commandPalette:customize.outputStyles')],
  }),
  new StaticItem('agents', i18n.t('commandPalette:customize.agents'), {
    keywords: [enKeyword('commandPalette:customize.agents')],
  }),
  new StaticItem('hooks', i18n.t('commandPalette:customize.hooks'), {
    keywords: [enKeyword('commandPalette:customize.hooks')],
  }),
  new StaticItem('memory', i18n.t('commandPalette:customize.memory'), {
    keywords: [enKeyword('commandPalette:customize.memory')],
  }),
  new StaticItem('permissions', i18n.t('commandPalette:customize.permissions'), {
    keywords: [enKeyword('commandPalette:customize.permissions')],
  }),
  new StaticItem('manage-mcp', i18n.t('commandPalette:customize.mcpServers'), {
    disabled: false,
    // Label is "MCP Servers" (matches "/mcp"); these keywords also surface it
    // for "/manage-mcp" and the bare "/manage" query.
    keywords: ['manage-mcp', 'mcp', enKeyword('commandPalette:customize.mcpServers')],
    action: async () => {
      window.dispatchEvent(new CustomEvent(OPEN_MCP_MODAL_EVENT));
    },
  }),
  new StaticItem('manage-plugins', i18n.t('commandPalette:customize.managePlugins'), {
    keywords: [enKeyword('commandPalette:customize.managePlugins')],
  }),
  new StaticItem('open-terminal', i18n.t('commandPalette:customize.openInTerminal'), {
    keywords: [enKeyword('commandPalette:customize.openInTerminal')],
    icon: IconType.Terminal,
    disabled: false,
    serviceAction: async (services) => {
      const workingDir = services.session.workingDirectory ?? '';
      await services.adapter.openTerminal(workingDir);
    },
  }),
  // The last row of the section: opens the session on screen in the Claude Desktop app, after a confirmation.
  new StaticItem('open-in-desktop', i18n.t('commandPalette:customize.openInDesktop'), {
    keywords: [enKeyword('commandPalette:customize.openInDesktop'), 'desktop'],
    icon: IconType.Claude,
    disabled: false,
    serviceAction: async (services) => {
      const sessionId = services.session.currentSessionId;
      if (!sessionId) {
        toast.error(i18n.t('chat:sessionRail.linked.openInDesktopNoSession'));
        return;
      }
      await confirmAndOpenSessionInDesktop(services.ui.confirm, sessionId, services.session.nameSessionForDesktop);
    },
  }),
];
