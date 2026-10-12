import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Route } from '@/router';

/**
 * #547: the scope the settings screen reads and writes lives in one place and
 * outlives the page that chose it. Some pages (IDE, privacy, account...) draw
 * no scope switch, so a user who picked "Project" on General and moved on found
 * those pages reading and saving the project's file with no switch on screen to
 * say so.
 *
 * A page without a switch has exactly one scope, the user's. Moving onto one
 * puts both stores back on global; moving onto a page that has the switch leaves
 * the user's choice alone.
 */

let mockRoute: Route = Route.SETTINGS_GENERAL;
let mockScope: 'global' | 'project' = 'project';
const setScopeMock = vi.fn();
const setClaudeScopeMock = vi.fn();

vi.mock('@/router', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ route: mockRoute }),
}));
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ scope: mockScope, setScope: setScopeMock }),
  useSettingsOrNull: () => null,
}));
vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ scope: mockScope, setScope: setClaudeScopeMock }),
  useClaudeSettingsOrNull: () => null,
}));
vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDir: () => ({ workingDirectory: '/project' }),
}));
vi.mock('../SettingsHeader', () => ({ SettingsHeader: () => null }));
vi.mock('../SettingsSidebar', () => ({ SettingsSidebar: () => null }));
vi.mock('../useSidebarLayout', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSidebarLayout: () => ({ mode: 'full', ref: { current: null } }),
}));

import { SettingsLayout } from '../SettingsLayout';

beforeEach(() => {
  setScopeMock.mockReset();
  setClaudeScopeMock.mockReset();
  mockScope = 'project';
});

describe('SettingsLayout scope', () => {
  it.each([
    Route.SETTINGS_IDE,
    Route.SETTINGS_PRIVACY,
    Route.SETTINGS_ACCOUNT,
    Route.SETTINGS_ABOUT,
  ])('puts both stores back on global when %s, a page without the switch, opens', (route) => {
    mockRoute = route;
    render(<SettingsLayout>content</SettingsLayout>);

    expect(setScopeMock).toHaveBeenCalledWith('global');
    expect(setClaudeScopeMock).toHaveBeenCalledWith('global');
    // Nothing on screen offers a way back to the project scope on such a page.
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it.each([Route.SETTINGS_GENERAL, Route.SETTINGS_APPEARANCE, Route.SETTINGS_PERMISSIONS])(
    'leaves the chosen scope alone on %s, a page with the switch',
    (route) => {
      mockRoute = route;
      render(<SettingsLayout>content</SettingsLayout>);

      expect(setScopeMock).not.toHaveBeenCalled();
      expect(setClaudeScopeMock).not.toHaveBeenCalled();
    },
  );

  it('does nothing on a page without the switch when the scope is already global', () => {
    mockRoute = Route.SETTINGS_IDE;
    mockScope = 'global';
    render(<SettingsLayout>content</SettingsLayout>);

    expect(setScopeMock).not.toHaveBeenCalled();
    expect(setClaudeScopeMock).not.toHaveBeenCalled();
  });
});
