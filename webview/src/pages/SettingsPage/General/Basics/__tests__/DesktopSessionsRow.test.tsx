import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const updateEntrypointMock = vi.fn();

vi.mock('@/api/ClaudeCodeApi', () => ({
  api: { sessions: { updateEntrypoint: (...args: unknown[]) => updateEntrypointMock(...args) } },
}));
vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDirOrNull: () => ({ workingDirectory: '/proj' }),
}));

import { DesktopSessionsRow } from '../DesktopSessionsRow';

const result = (over: Record<string, unknown> = {}) => ({
  updated: [],
  running: [],
  changedMeanwhile: [],
  failed: [],
  ...over,
});

beforeEach(() => {
  updateEntrypointMock.mockReset();
});

describe('DesktopSessionsRow', () => {
  it('asks for the sessions of the open folder only when the button is pressed', async () => {
    updateEntrypointMock.mockResolvedValue(result());
    render(<DesktopSessionsRow />);
    expect(updateEntrypointMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Get sessions ready to import into Claude Desktop' }));

    expect(await screen.findByText('No earlier sessions to prepare in /proj.')).toBeInTheDocument();
    expect(updateEntrypointMock).toHaveBeenCalledWith('/proj');
  });

  it('says where Desktop keeps the import once sessions are prepared', async () => {
    updateEntrypointMock.mockResolvedValue(result({ updated: ['a', 'b'] }));
    render(<DesktopSessionsRow />);

    fireEvent.click(screen.getByRole('button', { name: 'Get sessions ready to import into Claude Desktop' }));

    expect(await screen.findByText('Sessions prepared: 2')).toBeInTheDocument();
    expect(
      screen.getByText('In Claude Desktop, choose Help → Troubleshooting → Import Claude Code CLI Sessions…'),
    ).toBeInTheDocument();
  });

  it('reports the sessions left alone because they are in use, and the ones that failed', async () => {
    updateEntrypointMock.mockResolvedValue(
      result({ updated: ['a'], running: ['x'], changedMeanwhile: ['y'], failed: [{ sessionId: 'z', error: 'EACCES' }] }),
    );
    render(<DesktopSessionsRow />);

    fireEvent.click(screen.getByRole('button', { name: 'Get sessions ready to import into Claude Desktop' }));

    expect(
      await screen.findByText('Sessions left as they are because they are in use: 2. Close them and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sessions that could not be prepared: 1')).toBeInTheDocument();
  });

  it('shows the reason when the request is refused', async () => {
    updateEntrypointMock.mockRejectedValue(new Error('claude agents failed'));
    render(<DesktopSessionsRow />);

    fireEvent.click(screen.getByRole('button', { name: 'Get sessions ready to import into Claude Desktop' }));

    expect(await screen.findByText('Could not prepare the sessions: claude agents failed')).toBeInTheDocument();
  });
});
