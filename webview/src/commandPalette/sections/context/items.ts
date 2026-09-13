import { IconType } from '@/types/commandPalette';
import type { PromptScope, SavedPrompt } from '@/types/prompt';
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
 * Fired when the user picks "Prompt Library" from the Context section, or picks
 * the "create" row of the `!!` panel in the composer. The ChatPage opens the
 * prompt library modal; `detail.view === 'create'` asks it to land on the create
 * screen rather than the list.
 */
export const OPEN_PROMPT_LIBRARY_EVENT = 'command-palette:open-prompt-library';

export interface OpenPromptLibraryDetail {
  view?: 'list' | 'create';
  /**
   * Open straight on the edit screen for this prompt.
   *
   * The `!!` panel edits a prompt without leaving the composer, and the editor
   * is the library's, so the panel names what to edit and the library shows it.
   */
  edit?: { scope: PromptScope; prompt: SavedPrompt };
}

/**
 * Fired when the user picks a saved prompt in the prompt library modal. The
 * ChatInput appends the prompt's text to the composer and puts the caret after
 * it, the same thing picking a row in the `!!` panel does — the modal is the
 * other way to reach the same library, so picking must mean the same thing.
 *
 * Dispatched after the modal has closed, so the composer has focus back before
 * the insert runs.
 */
export const INSERT_PROMPT_EVENT = 'command-palette:insert-prompt';

export interface InsertPromptDetail {
  /** The prompt's text, exactly as it was saved. */
  content: string;
}

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
  // Below "Schedule a message": opens the prompt library, where saved phrases
  // are written and edited. The read side of the same store is the `!!` panel
  // in the composer (issue #430).
  new StaticItem('prompt-library', i18n.t('commandPalette:context.promptLibrary'), {
    keywords: [enKeyword('commandPalette:context.promptLibrary'), 'prompt', 'library', 'snippet'],
    icon: IconType.Bookmark,
    disabled: false,
    action: async () => {
      window.dispatchEvent(new CustomEvent(OPEN_PROMPT_LIBRARY_EVENT));
    },
  }),
];
