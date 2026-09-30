import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MessageType } from '@/shared';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
let mockScope: 'global' | 'project' = 'global';

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ send: mockSend, isConnected: true, subscribe: vi.fn(() => () => {}), lastError: null }),
}));
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ scope: mockScope }),
}));

import { NonessentialTrafficRow } from '../NonessentialTrafficRow';

const MANAGED_LOCK = {
  kind: 'managed-settings',
  variable: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  path: '/Library/Application Support/ClaudeCode/managed-settings.json',
};

function answer(initial: { disabled: boolean; managed?: boolean }) {
  let disabled = initial.disabled;
  const lock = initial.managed ? MANAGED_LOCK : null;
  mockSend.mockImplementation(async (type: MessageType, payload: unknown) => {
    if (type === MessageType.SET_NONESSENTIAL_TRAFFIC) disabled = (payload as { disabled: boolean }).disabled;
    return { status: 'ok', disabled, lock, settingsPath: '~/.claude/settings.json' };
  });
}

function renderRow() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <NonessentialTrafficRow />
    </QueryClientProvider>,
  );
}

const toggle = () => screen.findByRole('switch', { name: 'Block nonessential traffic' });

beforeEach(() => {
  mockSend.mockReset();
  mockScope = 'global';
});

/**
 * Claude Code's CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, which also keeps Claude Code from
 * updating itself. It has to be reachable without a terminal.
 */
describe('NonessentialTrafficRow', () => {
  it('shows the value Claude Code applies', async () => {
    answer({ disabled: true });
    renderRow();
    expect(await toggle()).toHaveAttribute('aria-checked', 'true');
  });

  it('lifts it without a terminal', async () => {
    answer({ disabled: true });
    renderRow();
    const sw = await toggle();
    await act(async () => {
      fireEvent.click(sw);
    });
    await waitFor(() => {
      const setCall = mockSend.mock.calls.find((c) => c[0] === MessageType.SET_NONESSENTIAL_TRAFFIC);
      expect(setCall?.[1]).toEqual({ disabled: false });
    });
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
  });

  it('cannot be changed when managed settings set it', async () => {
    answer({ disabled: true, managed: true });
    renderRow();
    expect(await toggle()).toBeDisabled();
  });

  it('is inert on the project tab, since only the user settings file is written', async () => {
    mockScope = 'project';
    answer({ disabled: false });
    renderRow();
    const sw = await toggle();
    expect(sw.closest('.pointer-events-none')).not.toBeNull();
  });
});
