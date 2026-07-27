import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionBanner } from '../PermissionBanner';
import type { PendingPermission } from '../../../hooks/usePendingPermissions';

const mockPermission: PendingPermission = {
  controlRequestId: 'ctrl-1',
  toolName: 'Bash',
  toolUseId: 'tool-1',
  input: { command: 'ls' },
  riskLevel: 'high',
  description: 'Execute: ls',
};

describe('PermissionBanner', () => {
  let onApprove: ReturnType<typeof vi.fn<() => void>>;
  let onApproveForSession: ReturnType<typeof vi.fn<() => void>>;
  let onDeny: ReturnType<typeof vi.fn<(reason?: string) => void>>;

  beforeEach(() => {
    onApprove = vi.fn<() => void>();
    onApproveForSession = vi.fn<() => void>();
    onDeny = vi.fn<(reason?: string) => void>();
  });

  it('renders the permission title', () => {
    render(
      <PermissionBanner
        permission={mockPermission}
        onApprove={onApprove}
        onApproveForSession={onApproveForSession}
        onDeny={onDeny}
      />,
    );

    expect(screen.getByText('Run this command?')).toBeInTheDocument();
  });

  it('calls onApprove when option 1 (Yes) is clicked', () => {
    render(
      <PermissionBanner
        permission={mockPermission}
        onApprove={onApprove}
        onApproveForSession={onApproveForSession}
        onDeny={onDeny}
      />,
    );

    fireEvent.click(screen.getByText('Yes'));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onDeny).not.toHaveBeenCalled();
  });

  it('calls onApproveForSession when option 2 (session approve) is clicked', () => {
    render(
      <PermissionBanner
        permission={mockPermission}
        onApprove={onApprove}
        onApproveForSession={onApproveForSession}
        onDeny={onDeny}
      />,
    );

    fireEvent.click(screen.getByText('Yes, allow all commands this session'));
    expect(onApproveForSession).toHaveBeenCalledTimes(1);
    expect(onDeny).not.toHaveBeenCalled();
  });

  it('calls onDeny without reason when option 3 (No) is clicked', () => {
    render(
      <PermissionBanner
        permission={mockPermission}
        onApprove={onApprove}
        onApproveForSession={onApproveForSession}
        onDeny={onDeny}
      />,
    );

    fireEvent.click(screen.getByText('No'));
    expect(onDeny).toHaveBeenCalledTimes(1);
    // Should be called without a reason argument (or with undefined)
    expect(onDeny).toHaveBeenCalledWith();
  });

  it('calls onDeny with reason text when textarea is submitted via Enter', () => {
    render(
      <PermissionBanner
        permission={mockPermission}
        onApprove={onApprove}
        onApproveForSession={onApproveForSession}
        onDeny={onDeny}
      />,
    );

    const textarea = screen.getByPlaceholderText('Tell Claude what to do instead');
    const reason = 'Please use a safer approach';

    fireEvent.change(textarea, { target: { value: reason } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    // onDeny must be called with the reason text
    expect(onDeny).toHaveBeenCalledTimes(1);
    expect(onDeny).toHaveBeenCalledWith(reason);
    expect(onApprove).not.toHaveBeenCalled();
    expect(onApproveForSession).not.toHaveBeenCalled();
  });

  it('does not call onDeny when textarea is empty and Enter is pressed', () => {
    render(
      <PermissionBanner
        permission={mockPermission}
        onApprove={onApprove}
        onApproveForSession={onApproveForSession}
        onDeny={onDeny}
      />,
    );

    const textarea = screen.getByPlaceholderText('Tell Claude what to do instead');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onDeny).not.toHaveBeenCalled();
  });

  it('does not submit on Shift+Enter (allows multiline input)', () => {
    render(
      <PermissionBanner
        permission={mockPermission}
        onApprove={onApprove}
        onApproveForSession={onApproveForSession}
        onDeny={onDeny}
      />,
    );

    const textarea = screen.getByPlaceholderText('Tell Claude what to do instead');
    fireEvent.change(textarea, { target: { value: 'line 1' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onDeny).not.toHaveBeenCalled();
  });

  it('trims whitespace from reason before passing to onDeny', () => {
    render(
      <PermissionBanner
        permission={mockPermission}
        onApprove={onApprove}
        onApproveForSession={onApproveForSession}
        onDeny={onDeny}
      />,
    );

    const textarea = screen.getByPlaceholderText('Tell Claude what to do instead');
    fireEvent.change(textarea, { target: { value: '  use echo instead  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onDeny).toHaveBeenCalledWith('use echo instead');
  });

  it('calls onDeny (cancel) at least once when Escape is pressed', () => {
    render(
      <PermissionBanner
        permission={mockPermission}
        onApprove={onApprove}
        onApproveForSession={onApproveForSession}
        onDeny={onDeny}
      />,
    );

    const textarea = screen.getByPlaceholderText('Tell Claude what to do instead');
    fireEvent.keyDown(textarea, { key: 'Escape' });

    // onDeny used as onCancel — must be called at least once
    expect(onDeny).toHaveBeenCalled();
    // When called as cancel (Escape), it should NOT be called with a reason string
    const calls = onDeny.mock.calls;
    calls.forEach(call => {
      expect(call[0]).toBeUndefined();
    });
  });
});

describe('PermissionBanner — MCP tool humanization', () => {
  function mcpPermission(toolName: string, input: Record<string, unknown> = {}): PendingPermission {
    return {
      controlRequestId: 'ctrl-mcp',
      toolName,
      toolUseId: 'tool-mcp',
      input,
      riskLevel: 'high',
      description: '',
    };
  }

  it('humanizes a JetBrains tool in the title and the session option', () => {
    render(
      <PermissionBanner
        permission={mcpPermission('mcp__idea__create_new_file', { pathInProject: 'README.md' })}
        onApprove={vi.fn()}
        onApproveForSession={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    expect(screen.getByText('Allow IntelliJ IDEA: Create new file?')).toBeInTheDocument();
    expect(screen.getByText(/Yes, allow all .*Create new file.* this session/)).toBeInTheDocument();
  });

  it('falls back to "Server [tool]" for non-JetBrains MCP tools', () => {
    render(
      <PermissionBanner
        permission={mcpPermission('mcp__claude_ai_Gmail__search_threads')}
        onApprove={vi.fn()}
        onApproveForSession={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    expect(screen.getByText(/Allow .*\[search_threads]\?/)).toBeInTheDocument();
  });

  it('does not crash when an MCP tool sends a non-string `path` (xdebug value path)', () => {
    // Regression: `path: ["greeter","name"]` used to hit basename().split() and
    // crash the whole chat. The MCP branch must never treat `path` as a string.
    expect(() =>
      render(
        <PermissionBanner
          permission={mcpPermission('mcp__idea__xdebug_get_value_by_path', {
            sessionId: 'App',
            path: ['greeter', 'name'],
          })}
          onApprove={vi.fn()}
          onApproveForSession={vi.fn()}
          onDeny={vi.fn()}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByText('Allow IntelliJ IDEA: Debugger: inspect value?')).toBeInTheDocument();
  });
});
