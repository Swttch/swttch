import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const updateSettingMock = vi.fn();

// What the settings screen is handed: the open tab's own file (`scopeSettings`),
// and the value in effect once global and project are merged (`settings`).
let mockScope: 'global' | 'project' = 'global';
let mockScopeSettings: Record<string, unknown> = {};
let mockMergedSettings: Record<string, unknown> = {};

vi.mock('@/contexts/SettingsContext', () => ({
  useSettingsOrNull: () => null,
  useSettings: () => ({
    scope: mockScope,
    scopeSettings: mockScopeSettings,
    settings: mockMergedSettings,
    updateSetting: updateSettingMock,
  }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettingsOrNull: () => null,
}));

import { FollowUpBehaviorRow } from '../FollowUpBehaviorRow';

const followUpSelect = () => screen.getByRole('button', { name: 'Follow-up behavior' });
const inheritedBadge = () => screen.queryByRole('img', { name: /Not set in this project/ });

beforeEach(() => {
  updateSettingMock.mockReset();
  mockScope = 'global';
  mockScopeSettings = {};
  mockMergedSettings = {};
});

/**
 * #547: the project tab read the project's own file and, finding nothing, drew
 * the app's fallback. A global setting of "steer" showed up as "Queue" on the
 * project tab while the composer, reading the merged value, behaved as steer.
 * A project that has not set the key shows what it inherits: the global value,
 * and only without one the built-in default.
 */
describe('FollowUpBehaviorRow', () => {
  describe('on the project tab', () => {
    beforeEach(() => {
      mockScope = 'project';
    });

    it('shows the global value when the project has not set one', () => {
      mockScopeSettings = {};
      mockMergedSettings = { composerFollowUpBehavior: 'steer' };
      render(<FollowUpBehaviorRow />);

      expect(followUpSelect()).toHaveTextContent('Steer');
      expect(inheritedBadge()).toBeInTheDocument();
    });

    it('shows a global queue as queue, not as whatever the built-in default is', () => {
      mockScopeSettings = {};
      mockMergedSettings = { composerFollowUpBehavior: 'queue' };
      render(<FollowUpBehaviorRow />);

      expect(followUpSelect()).toHaveTextContent('Queue');
      expect(inheritedBadge()).toBeInTheDocument();
    });

    it('shows the built-in default only when neither global nor project set one', () => {
      mockScopeSettings = {};
      mockMergedSettings = { composerFollowUpBehavior: null };
      render(<FollowUpBehaviorRow />);

      expect(followUpSelect()).toHaveTextContent('Steer');
      expect(inheritedBadge()).toBeInTheDocument();
    });

    it("shows the project's own value, without the inherited mark, when it set one", () => {
      mockScopeSettings = { composerFollowUpBehavior: 'queue' };
      mockMergedSettings = { composerFollowUpBehavior: 'queue' };
      render(<FollowUpBehaviorRow />);

      expect(followUpSelect()).toHaveTextContent('Queue');
      expect(inheritedBadge()).not.toBeInTheDocument();
    });
  });

  describe('on the global tab', () => {
    it('shows steer for a user who never chose', () => {
      mockScopeSettings = { composerFollowUpBehavior: null };
      render(<FollowUpBehaviorRow />);

      expect(followUpSelect()).toHaveTextContent('Steer');
      expect(inheritedBadge()).not.toBeInTheDocument();
    });

    it('shows the global value even when a project would override it', () => {
      mockScopeSettings = { composerFollowUpBehavior: 'queue' };
      mockMergedSettings = { composerFollowUpBehavior: 'steer' };
      render(<FollowUpBehaviorRow />);

      expect(followUpSelect()).toHaveTextContent('Queue');
    });
  });
});
