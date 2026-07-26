import { IconType } from '@/types/commandPalette';
import { i18n } from '@/i18n';
import { StaticItem } from '../../types';
import { enKeyword } from '../../enKeyword';

/**
 * Fired when the user runs `/resume`. The session dropdown opens (browse/resume
 * past conversations) and the composer clears the `/resume` text. Issue #28.
 */
export const OPEN_SESSION_DROPDOWN_EVENT = 'command-palette:open-session-dropdown';

/**
 * Fired when the user picks "Schedule a message" from the Context section. The
 * ChatInput opens the schedule-send popover (pre-filled from the composer
 * draft). Everyone can open it; the sponsor gate lives on the popover's submit.
 */
export const OPEN_SCHEDULE_SEND_EVENT = 'command-palette:open-schedule-send';

/**
 * Built on demand (not a module-eval constant) so the labels resolve against
 * the current locale after i18n init. Called once when the registry registers
 * the Context section.
 */
export const getContextItems = (): StaticItem[] => [
  new StaticItem('attach-file', i18n.t('commandPalette:context.attachFile'), {
    keywords: [enKeyword('commandPalette:context.attachFile')],
    icon: IconType.File,
    disabled: false,
    action: async () => {
      window.dispatchEvent(new CustomEvent('command-palette:attach-files'));
    },
  }),
  new StaticItem('mention-file', i18n.t('commandPalette:context.mentionFile'), {
    keywords: [enKeyword('commandPalette:context.mentionFile')],
    icon: IconType.File,
    disabled: false,
    action: async () => {
      window.dispatchEvent(new CustomEvent('command-palette:mention-file'));
    },
  }),
  new StaticItem('clear-conversation', i18n.t('commandPalette:context.clearConversation'), {
    keywords: [enKeyword('commandPalette:context.clearConversation')],
    disabled: false,
    serviceAction: async (services) => {
      if (services.chatStream.isStreaming) services.chatStream.stop();
      services.chatStream.resetForSessionSwitch();
      services.session.resetToNewSession();
    },
  }),
  // Search-only: surfaces when the user types `/resume`. Opens the session
  // dropdown so past conversations can be browsed and resumed (issue #28).
  new StaticItem('resume-conversation', i18n.t('commandPalette:context.resumeConversation'), {
    keywords: [enKeyword('commandPalette:context.resumeConversation'), 'resume'],
    disabled: false,
    searchOnly: true,
    action: async () => {
      window.dispatchEvent(new CustomEvent(OPEN_SESSION_DROPDOWN_EVENT));
    },
  }),
  // Search-only: surfaces when the user types `/workflows` (mirrors the CLI's
  // /workflows). Opens the Background tasks panel — a local action, no message
  // is sent to Claude.
  new StaticItem('open-workflows', i18n.t('commandPalette:context.showBackgroundTasks'), {
    disabled: false,
    searchOnly: true,
    keywords: ['workflows', 'workflow'],
    serviceAction: async (services) => {
      services.workflowState.openPanel();
    },
  }),
  // Bottom of the Context section: opens the "schedule send" popover, pre-filled
  // from the composer draft. Clickable by everyone; the sponsor gate lives on
  // the popover's submit (ensureSponsor), not on opening it.
  new StaticItem('schedule-send', i18n.t('commandPalette:context.scheduleSend'), {
    keywords: [enKeyword('commandPalette:context.scheduleSend'), 'schedule', 'send later', 'remind'],
    icon: IconType.Clock,
    disabled: false,
    action: async () => {
      window.dispatchEvent(new CustomEvent(OPEN_SCHEDULE_SEND_EVENT));
    },
  }),
];
