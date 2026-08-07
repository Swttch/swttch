import { useRouter, Route } from '@/router';
import { ROUTE_META } from '@/router/routes';
import { useStaticDocumentTitle } from '@/hooks';
import { SettingsLayout } from './SettingsLayout';
import { GeneralSettings } from './General';
import { AppearanceSettings } from './Appearance';
import { PermissionsSettings } from './Permissions';
import { CliSettings } from './Cli';
import { AdvancedSettings } from './Advanced';
import { TunnelSettings } from './Tunnel';
import { AboutSettings } from './About';
import { UsageSettings } from './Usage';
import { ReleasesSettings } from './Releases';
import { AccountSettings } from './Account';
import { BrowserSettings } from './Browser';
import { PrivacySettings } from './Privacy';
import { SponsorSettings } from './Sponsor';

interface SettingsPageProps {
  /**
   * True when rendered inside {@link SettingsOverlay} (the "Open Settings as:
   * Overlay" mode) rather than as a page of its own. The overlay leaves the
   * underlying tab in place, so the page must not claim the tab title.
   */
  asOverlay?: boolean;
}

/**
 * The tab label this screen should report to the IDE.
 *
 * As a page of its own it claims the tab: without a title the JetBrains editor
 * tab falls back to the raw URL (e.g. "localhost:PORT/settings...").
 *
 * As an overlay it claims nothing — the settings sit *on top of* the chat,
 * which still owns the tab. Renaming it to "Settings" would relabel a tab the
 * user never navigated away from, and since the IDE derives the editor tab's
 * title (and its persisted label) from document.title, the wrong name outlives
 * the overlay. `useStaticDocumentTitle` ignores an empty string, so returning
 * one leaves the existing title untouched.
 */
export function settingsTabTitle(asOverlay: boolean): string {
  return asOverlay ? '' : ROUTE_META[Route.SETTINGS].label;
}

/**
 * Settings 메인 컴포넌트 - 현재 라우트에 따라 적절한 설정 페이지 렌더링
 */
export function SettingsPage({ asOverlay = false }: SettingsPageProps = {}) {
  const { route } = useRouter();

  useStaticDocumentTitle(settingsTabTitle(asOverlay));

  const renderContent = () => {
    switch (route) {
      case Route.SETTINGS_GENERAL:
        return <GeneralSettings />;
      case Route.SETTINGS_APPEARANCE:
        return <AppearanceSettings />;
      case Route.SETTINGS_PERMISSIONS:
        return <PermissionsSettings />;
      case Route.SETTINGS_PRIVACY:
        return <PrivacySettings />;
      case Route.SETTINGS_CLI:
        return <CliSettings />;
      case Route.SETTINGS_ADVANCED:
        return <AdvancedSettings />;
      case Route.SETTINGS_TUNNEL:
        return <TunnelSettings />;
      case Route.SETTINGS_BROWSER:
        return <BrowserSettings />;
      case Route.SETTINGS_ACCOUNT:
        return <AccountSettings />;
      case Route.SETTINGS_SPONSOR:
        return <SponsorSettings />;
      case Route.SETTINGS_ABOUT:
        return <AboutSettings />;
      case Route.SETTINGS_USAGE:
        return <UsageSettings />;
      case Route.SETTINGS_RELEASES:
        return <ReleasesSettings />;
      default:
        return <GeneralSettings />;
    }
  };

  return (
    <SettingsLayout>
      {renderContent()}
    </SettingsLayout>
  );
}

export { SettingsOverlay } from './SettingsOverlay';
