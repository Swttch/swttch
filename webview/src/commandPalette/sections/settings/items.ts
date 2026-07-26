import { i18n } from '@/i18n';
import { StaticItem } from '../../types';
import { enKeyword } from '../../enKeyword';
import { Route } from '@/router';
import { loginPathWithFallback } from '@/router/routes';
import { openSettingsAt } from '@/utils/openSettingsAt';

/** Navigate to the account switch page. Shared by "Switch account" and /login.
 * Remembers the current location as `?fallback=` (via loginPathWithFallback) and
 * PUSHes, so login → back returns to where the user was. (#178) */
const openSwitchAccount = async () => {
  const current = `${window.location.pathname}${window.location.search}`;
  window.history.pushState({}, '', loginPathWithFallback(current));
  window.dispatchEvent(new PopStateEvent('popstate'));
};

/**
 * Built on demand (not a module-eval constant) so the labels resolve against
 * the current locale after i18n init. Called once when the registry registers
 * the Settings section. Note: the "/login" alias label is a slash-command
 * token, not a translatable phrase, so it stays a literal.
 */
export const getSettingsItems = (): StaticItem[] => [
  // Search-only alias: surfaces when the user types `/login`. Same destination
  // as "Switch account" — the account switch page. Listed before
  // "Switch account" so it appears first under the /login search.
  new StaticItem('login', '/login', {
    disabled: false,
    searchOnly: true,
    action: openSwitchAccount,
  }),
  new StaticItem('switch-account', i18n.t('commandPalette:settings.switchAccount'), {
    disabled: false,
    // Also surfaces under the `/login` search, alongside the /login alias.
    keywords: ['login', enKeyword('commandPalette:settings.switchAccount')],
    action: openSwitchAccount,
  }),
  new StaticItem('general-config', i18n.t('commandPalette:settings.generalConfig'), {
    disabled: false,
    keywords: [enKeyword('commandPalette:settings.generalConfig')],
    action: async () => {
      await openSettingsAt(Route.SETTINGS_GENERAL);
    },
  }),
];
