import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SettingKey } from '@/types/settings';

/**
 * Wiring tests for #237: the `attachEditorContext` setting seeds the chip at the
 * start of a session, and a click stays inside that session.
 *
 * resolveInitialInclude already covers the decision itself, so what is pinned
 * here is the wiring around it — that the provider reads the setting at all,
 * that it re-seeds when a session begins, and that it never writes back.
 */

const settingsState = {
  settings: {} as Record<string, unknown>,
  isLoading: false,
  updateSetting: vi.fn(),
};

const sessionState = {
  workingDirectory: '/work',
  currentSessionId: null as string | null,
};

vi.mock('../SettingsContext', () => ({
  useSettings: () => settingsState,
}));

vi.mock('../SessionContext', () => ({
  useSessionContext: () => sessionState,
}));

vi.mock('@/hooks/useIdeSelection', () => ({
  useIdeSelection: () => ({ currentSelection: null }),
}));

import { IdeSelectionProvider, useIdeSelectionContext } from '../IdeSelectionContext';

function Probe() {
  const { includeSelection, toggleIncludeSelection } = useIdeSelectionContext();
  return (
    <button onClick={toggleIncludeSelection} data-testid="chip">
      {includeSelection ? 'included' : 'excluded'}
    </button>
  );
}

function renderProvider() {
  return render(
    <IdeSelectionProvider>
      <Probe />
    </IdeSelectionProvider>,
  );
}

const chipText = () => screen.getByTestId('chip').textContent;

beforeEach(() => {
  settingsState.settings = {};
  settingsState.isLoading = false;
  settingsState.updateSetting = vi.fn();
  sessionState.currentSessionId = null;
});

describe('IdeSelectionProvider seeding', () => {
  it('starts excluded while the settings load is still in flight', () => {
    settingsState.isLoading = true;
    settingsState.settings = { [SettingKey.ATTACH_EDITOR_CONTEXT]: true };
    renderProvider();
    expect(chipText()).toBe('excluded');
  });

  it('starts included when the setting is absent', () => {
    renderProvider();
    expect(chipText()).toBe('included');
  });

  it('starts excluded when the setting is explicitly false', () => {
    settingsState.settings = { [SettingKey.ATTACH_EDITOR_CONTEXT]: false };
    renderProvider();
    expect(chipText()).toBe('excluded');
  });

  it('flips to the setting value once the load finishes', () => {
    settingsState.isLoading = true;
    const { rerender } = renderProvider();
    expect(chipText()).toBe('excluded');

    settingsState.isLoading = false;
    settingsState.settings = { [SettingKey.ATTACH_EDITOR_CONTEXT]: true };
    act(() => {
      rerender(
        <IdeSelectionProvider>
          <Probe />
        </IdeSelectionProvider>,
      );
    });
    expect(chipText()).toBe('included');
  });
});

describe('IdeSelectionProvider toggle stays session-local', () => {
  it('never writes the toggle back to the settings file', () => {
    renderProvider();
    fireEvent.click(screen.getByTestId('chip'));
    expect(chipText()).toBe('excluded');
    expect(settingsState.updateSetting).not.toHaveBeenCalled();
  });

  it('keeps a mid-session toggle across unrelated re-renders', () => {
    const { rerender } = renderProvider();
    fireEvent.click(screen.getByTestId('chip'));
    expect(chipText()).toBe('excluded');

    // Nothing about the session or the setting changed, so the click must hold.
    act(() => {
      rerender(
        <IdeSelectionProvider>
          <Probe />
        </IdeSelectionProvider>,
      );
    });
    expect(chipText()).toBe('excluded');
  });

  it('re-seeds from the setting when a new session begins', () => {
    const { rerender } = renderProvider();
    fireEvent.click(screen.getByTestId('chip'));
    expect(chipText()).toBe('excluded');

    // A different session id is what /clear, reset and new session all produce.
    sessionState.currentSessionId = 'session-2';
    act(() => {
      rerender(
        <IdeSelectionProvider>
          <Probe />
        </IdeSelectionProvider>,
      );
    });
    expect(chipText()).toBe('included');
  });
});
