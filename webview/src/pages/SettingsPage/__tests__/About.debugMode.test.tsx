import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Issue #723: the "Debug Mode" row has to be somewhere a person can reach. The Advanced page that
 * used to hold it is not on the sidebar, so the row sits on the About page, next to the version
 * and environment lines a bug report is filled in from.
 */

vi.mock('@/hooks/useVersionInfo', () => ({
  useVersionInfo: () => ({
    pluginVersion: '0.0.0',
    cliVersion: null,
    clientInfo: null,
    osInfo: null,
    refresh: vi.fn(),
    isLoading: false,
  }),
}));
vi.mock('../About/CliUpdateControl', () => ({ CliUpdateControl: () => null }));
vi.mock('../About/CliAutoUpdateRow', () => ({ CliAutoUpdateRow: () => null }));
vi.mock('../About/Dependencies', () => ({ DependenciesSection: () => null }));
vi.mock('../Advanced/Debugging/DebugModeRow', () => ({
  DebugModeRow: () => <div data-testid="debug-mode-row" />,
}));

import { AboutSettings } from '../About';

describe('AboutSettings', () => {
  it('shows the Debug Mode row', () => {
    render(<AboutSettings />);
    expect(screen.getByTestId('debug-mode-row')).toBeTruthy();
  });
});
