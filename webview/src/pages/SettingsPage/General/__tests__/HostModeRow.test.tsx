import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingKey, HostMode } from '@/types/settings';

// ---------------------------------------------------------------------------
// Mocks: SettingsContext + runtime detection
// ---------------------------------------------------------------------------

const updateSettingWithScopeMock = vi.fn();
let mockHostMode: HostMode = HostMode.EDITOR_TAB;
let mockIsJetBrains = true;

vi.mock('@/contexts/SettingsContext', () => ({
  // Rows read project-override info through this; null = nothing overridden.
  useSettingsOrNull: () => null,
  useSettings: () => ({
    settings: { [SettingKey.HOST_MODE]: mockHostMode },
    updateSettingWithScope: updateSettingWithScopeMock,
  }),
}));

vi.mock('@/config/environment', () => ({
  isJetBrains: () => mockIsJetBrains,
}));

import { HostModeRow } from '../HostModeRow';

beforeEach(() => {
  updateSettingWithScopeMock.mockReset();
  mockHostMode = HostMode.EDITOR_TAB;
  mockIsJetBrains = true;
});

const getTrigger = () =>
  screen.getByRole('button', { name: /Preferred Location/i }) as HTMLButtonElement;

describe('HostModeRow', () => {
  it('renders nothing in the browser (non-JetBrains) runtime', () => {
    mockIsJetBrains = false;
    const { container } = render(<HostModeRow />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the selector in the JetBrains runtime', () => {
    render(<HostModeRow />);
    expect(getTrigger()).toBeInTheDocument();
  });

  it('reflects the current editor-tab value', () => {
    mockHostMode = HostMode.EDITOR_TAB;
    render(<HostModeRow />);
    expect(getTrigger().textContent).toContain('Panel');
  });

  it('reflects the current tool-window value', () => {
    mockHostMode = HostMode.TOOL_WINDOW;
    render(<HostModeRow />);
    expect(getTrigger().textContent).toContain('Sidebar');
  });

  it('offers both host modes', () => {
    render(<HostModeRow />);
    fireEvent.click(getTrigger());
    const labels = screen.getAllByRole('option').map((o) => o.textContent?.replace('✓', '').trim());
    expect(labels).toEqual(['Sidebar', 'Panel']);
  });

  it('saves the chosen mode to the global scope', () => {
    render(<HostModeRow />);
    fireEvent.click(getTrigger());
    fireEvent.click(screen.getByRole('option', { name: 'Sidebar' }));

    expect(updateSettingWithScopeMock).toHaveBeenCalledTimes(1);
    expect(updateSettingWithScopeMock).toHaveBeenCalledWith(
      SettingKey.HOST_MODE,
      HostMode.TOOL_WINDOW,
      'global',
    );
  });
});
