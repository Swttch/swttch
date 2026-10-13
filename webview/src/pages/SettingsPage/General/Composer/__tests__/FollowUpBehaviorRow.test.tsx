import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const updateSettingMock = vi.fn();
const resetToGlobalMock = vi.fn();

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
    resetToGlobal: resetToGlobalMock,
  }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettingsOrNull: () => null,
}));

import { FollowUpBehaviorRow } from '../FollowUpBehaviorRow';
import { projectValueBadge, resetFromBadge } from '../../../__tests__/projectValueBadge';

const followUpSelect = () => screen.getByRole('button', { name: 'Follow-up behavior' });
const inheritedBadge = () => screen.queryByRole('img', { name: /Not set in this project/ });

beforeEach(() => {
  updateSettingMock.mockReset();
  resetToGlobalMock.mockReset();
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

  // A project that stored its own value had no way to take it back from this
  // row, so it stayed pinned to a choice the user may have made once and forgotten.
  describe('taking the project value back', () => {
    beforeEach(() => {
      mockScope = 'project';
    });

    it('offers "Not set" while the project has its own value, and clears it', () => {
      mockScopeSettings = { composerFollowUpBehavior: 'steer' };
      mockMergedSettings = { composerFollowUpBehavior: 'steer' };
      render(<FollowUpBehaviorRow />);

      fireEvent.click(followUpSelect());
      fireEvent.click(screen.getByRole('option', { name: 'Not set (use global)' }));

      expect(resetToGlobalMock).toHaveBeenCalledWith('composerFollowUpBehavior');
      expect(updateSettingMock).not.toHaveBeenCalled();
    });

    it('wears the project-value badge, whose reset link clears it', async () => {
      mockScopeSettings = { composerFollowUpBehavior: 'queue' };
      mockMergedSettings = { composerFollowUpBehavior: 'queue' };
      render(<FollowUpBehaviorRow />);

      expect(projectValueBadge()).toBeInTheDocument();
      await resetFromBadge();

      expect(resetToGlobalMock).toHaveBeenCalledWith('composerFollowUpBehavior');
    });

    it('wears no project-value badge while the project inherits', () => {
      mockScopeSettings = {};
      mockMergedSettings = { composerFollowUpBehavior: 'queue' };
      render(<FollowUpBehaviorRow />);

      expect(projectValueBadge()).not.toBeInTheDocument();
    });

    it('does not offer it while the project inherits, and choosing a value stores it', () => {
      mockScopeSettings = {};
      mockMergedSettings = { composerFollowUpBehavior: 'queue' };
      render(<FollowUpBehaviorRow />);

      fireEvent.click(followUpSelect());
      expect(screen.queryByRole('option', { name: 'Not set (use global)' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('option', { name: 'Queue' }));
      expect(updateSettingMock).toHaveBeenCalledWith('composerFollowUpBehavior', 'queue');
    });
  });

  describe('on the global tab', () => {
    it('never offers "Not set", because the global file is the end of the chain', () => {
      mockScopeSettings = { composerFollowUpBehavior: 'queue' };
      render(<FollowUpBehaviorRow />);

      fireEvent.click(followUpSelect());
      expect(screen.queryByRole('option', { name: 'Not set (use global)' })).not.toBeInTheDocument();
    });

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
