import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const sendMock = vi.fn();
let mockScope: 'global' | 'project' = 'global';
let mockWorkingDir: string | null = '/proj';

vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ send: sendMock }),
}));
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ scope: mockScope }),
}));
vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDir: () => ({ workingDirectory: mockWorkingDir }),
}));

import { ClaudeConfigDirRow } from '../ClaudeConfigDirRow';
import { MessageType } from '@/shared';

interface Info {
  effective: string;
  globalSetting: string | null;
  projectSetting: string | null;
  inherited: string | null;
}

function mockInfo(info: Info) {
  sendMock.mockImplementation((type: string) => {
    if (type === MessageType.GET_CLAUDE_CONFIG_DIR) return Promise.resolve(info);
    return Promise.resolve({ status: 'ok' });
  });
}

beforeEach(() => {
  sendMock.mockReset();
  mockScope = 'global';
  mockWorkingDir = '/proj';
});

describe('ClaudeConfigDirRow', () => {
  it('labels the field with the variable name verbatim', async () => {
    mockInfo({ effective: '/home/u/.claude', globalSetting: null, projectSetting: null, inherited: null });
    render(<ClaudeConfigDirRow />);
    expect(await screen.findByText('CLAUDE_CONFIG_DIR')).toBeInTheDocument();
  });

  it('shows the active directory', async () => {
    mockInfo({ effective: '/home/u/.claude-work', globalSetting: '/home/u/.claude-work', projectSetting: null, inherited: null });
    render(<ClaudeConfigDirRow />);
    expect(await screen.findByText(/Active: \/home\/u\/\.claude-work/)).toBeInTheDocument();
  });

  it('has no Save button (saves on blur)', async () => {
    mockInfo({ effective: '/home/u/.claude', globalSetting: null, projectSetting: null, inherited: null });
    render(<ClaudeConfigDirRow />);
    await screen.findByText(/Active:/);
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('saves the edited value to the active scope on blur', async () => {
    mockInfo({ effective: '/home/u/.claude', globalSetting: null, projectSetting: null, inherited: null });
    render(<ClaudeConfigDirRow />);
    await screen.findByText(/Active:/);

    const input = screen.getByLabelText('CLAUDE_CONFIG_DIR') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '/new/.claude-work' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(sendMock).toHaveBeenCalledWith(MessageType.SAVE_CLAUDE_CONFIG_DIR, {
        value: '/new/.claude-work',
        scope: 'global',
        workingDir: '/proj',
      });
    });
  });

  it('does not save on blur when the value is unchanged', async () => {
    mockInfo({ effective: '/g', globalSetting: '/g', projectSetting: null, inherited: null });
    render(<ClaudeConfigDirRow />);
    await screen.findByText(/Active:/);

    const input = screen.getByLabelText('CLAUDE_CONFIG_DIR') as HTMLInputElement;
    fireEvent.blur(input);

    expect(sendMock).not.toHaveBeenCalledWith(MessageType.SAVE_CLAUDE_CONFIG_DIR, expect.anything());
  });

  it('clearing the field saves null (back to default)', async () => {
    mockInfo({ effective: '/g', globalSetting: '/g', projectSetting: null, inherited: null });
    render(<ClaudeConfigDirRow />);
    await screen.findByText(/Active:/);

    const input = screen.getByLabelText('CLAUDE_CONFIG_DIR') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(sendMock).toHaveBeenCalledWith(MessageType.SAVE_CLAUDE_CONFIG_DIR, {
        value: null,
        scope: 'global',
        workingDir: '/proj',
      });
    });
  });

  it('disables editing for project scope when no project is open', async () => {
    mockScope = 'project';
    mockWorkingDir = null;
    mockInfo({ effective: '/home/u/.claude', globalSetting: null, projectSetting: null, inherited: null });
    render(<ClaudeConfigDirRow />);
    await screen.findByText(/Open a project/i);
    expect(screen.getByLabelText('CLAUDE_CONFIG_DIR')).toBeDisabled();
  });
});
