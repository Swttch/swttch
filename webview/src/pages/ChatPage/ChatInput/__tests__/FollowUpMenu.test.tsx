import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FollowUpBehavior } from '@/shared';
import { SettingKey } from '@/types/settings';
import { FollowUpMenu } from '../FollowUpMenu';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const settingsMock = {
  settings: { composerFollowUpBehavior: null } as Record<string, unknown>,
  overrides: [] as string[],
  updateSettingWithScope: vi.fn().mockResolvedValue(undefined),
};
vi.mock('@/contexts/SettingsContext', () => ({ useSettings: () => settingsMock }));

beforeEach(() => {
  settingsMock.settings = { composerFollowUpBehavior: null };
  settingsMock.overrides = [];
  settingsMock.updateSettingWithScope.mockClear();
});

function open() {
  render(<FollowUpMenu />);
  fireEvent.click(screen.getByLabelText('chatInput.followUpMenu.label'));
}

describe('FollowUpMenu', () => {
  it('marks the effective behavior (steer by default)', () => {
    open();
    expect(screen.getByRole('menuitemradio', { name: 'chatInput.followUpMenu.steer' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitemradio', { name: 'chatInput.followUpMenu.queue' }).getAttribute('aria-checked')).toBe('false');
  });

  it('writes the global setting when the project does not override it', () => {
    open();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'chatInput.followUpMenu.queue' }));
    expect(settingsMock.updateSettingWithScope).toHaveBeenCalledWith(
      SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR, FollowUpBehavior.Queue, 'global',
    );
    expect(screen.queryByRole('menuitemradio')).toBeNull();
  });

  it('writes the project setting when the project overrides it', () => {
    settingsMock.overrides = [SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR];
    settingsMock.settings = { composerFollowUpBehavior: FollowUpBehavior.Queue };
    open();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'chatInput.followUpMenu.steer' }));
    expect(settingsMock.updateSettingWithScope).toHaveBeenCalledWith(
      SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR, FollowUpBehavior.Steer, 'project',
    );
  });

  it('closes on Escape and takes the key so the composer does not interrupt', () => {
    open();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { document.body.dispatchEvent(event); });
    expect(screen.queryByRole('menuitemradio')).toBeNull();
    expect(event.defaultPrevented).toBe(true);
  });
});
