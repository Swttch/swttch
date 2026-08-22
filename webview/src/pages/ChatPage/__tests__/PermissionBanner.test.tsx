import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionBanner } from '../PermissionBanner';
import type { PendingPermission } from '../../../hooks/usePendingPermissions';

const mockStop = vi.fn();
vi.mock('../../../contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ stop: mockStop }),
}));

let diffAvailable = true;
vi.mock('../../../hooks/useIdeDiffAvailable', () => ({
  useIdeDiffAvailable: () => diffAvailable,
}));

const openDiffForRequest = vi.fn();
// Answers no pending change, so these tests see the panel without a review
// diff. Drawing one inline is the no-IDE path and has its own tests.
const getDiffPreview = vi.fn(async () => null);
const resolveDiff = vi.fn();
vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => ({ tools: { openDiffForRequest, getDiffPreview, resolveDiff } }),
}));

const mockPermission: PendingPermission = {
  controlRequestId: 'ctrl-1',
  toolName: 'Bash',
  toolUseId: 'tool-1',
  input: { command: 'ls' },
  riskLevel: 'high',
  description: 'Execute: ls',
};

beforeEach(() => {
  mockStop.mockClear();
  openDiffForRequest.mockClear();
  // The prompt's file name is only a link where a diff can be shown; most tests
  // here are about the rest of the panel, so keep it available by default.
  diffAvailable = true;
});

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

  /**
   * Cancelling is "stop what you are doing", not "no to this one file".
   *
   * A denial on its own only answers this request: the turn keeps running, so
   * Claude moves on to the next tool call and writes up the refusal, and the
   * user sees their interruption come back as an answer. Measured in the
   * sandbox IDE. The other two prompt panels already end the turn here.
   */
  it.each([
    ['the hint is clicked', () => fireEvent.click(screen.getByRole('button', { name: 'Esc to cancel' }))],
    ['Escape is pressed', () => fireEvent.keyDown(window, { key: 'Escape' })],
  ])('ends the turn as well as the request when %s', (_label, cancel) => {
    render(
      <PermissionBanner
        permission={mockPermission}
        onApprove={onApprove}
        onApproveForSession={onApproveForSession}
        onDeny={onDeny}
      />,
    );

    cancel();

    expect(onDeny).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledTimes(1);
    // React hands a click handler its MouseEvent, and this deny takes an
    // optional reason — the event landed there, JSON.stringify threw on the
    // circular DOM node, and the message never reached the backend, so the CLI
    // waited forever with the diff still open. Types cannot catch it.
    expect(onDeny.mock.calls[0][0]).toBeUndefined();
  });

  it('answers without ending the turn when an option is chosen or a reason typed', () => {
    // Not "always stop": answering the question is not an interruption.
    render(
      <PermissionBanner
        permission={mockPermission}
        onApprove={onApprove}
        onApproveForSession={onApproveForSession}
        onDeny={onDeny}
      />,
    );

    fireEvent.click(screen.getByText('No'));
    expect(mockStop).not.toHaveBeenCalled();

    const textarea = screen.getByPlaceholderText('Tell Claude what to do instead');
    fireEvent.change(textarea, { target: { value: 'use echo instead' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onDeny).toHaveBeenCalledWith('use echo instead');
    expect(mockStop).not.toHaveBeenCalled();
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

const writePermission: PendingPermission = {
  controlRequestId: 'ctrl-1',
  toolName: 'Write',
  toolUseId: 'toolu_1',
  input: { file_path: '/tmp/ccg-demo/src/cart.js', content: 'x' },
  riskLevel: 'medium',
  description: 'Write file: /tmp/ccg-demo/src/cart.js',
};

function renderBanner(p: PendingPermission = writePermission) {
  render(
    <PermissionBanner
      permission={p}
      onApprove={vi.fn()}
      onApproveForSession={vi.fn()}
      onDeny={vi.fn()}
    />,
  );
}

describe('PermissionBanner — the file name links to the diff', () => {
  it('renders the file name as a link and keeps the rest of the title as text', () => {
    renderBanner();

    const link = screen.getByRole('button', { name: 'cart.js' });
    expect(link).toBeInTheDocument();
    // The sentence around it is unchanged — only the name became clickable.
    expect(screen.getByText(/Write to/)).toBeInTheDocument();
  });

  it('opens the diff for this request when the name is clicked', () => {
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'cart.js' }));

    // By id: the contents live backend-side, so the click names the request
    // rather than shipping the file through the webview.
    expect(openDiffForRequest).toHaveBeenCalledWith('toolu_1');
  });

  it('does not answer or interrupt the request', () => {
    // Looking at the change is not deciding about it.
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'cart.js' }));
    expect(mockStop).not.toHaveBeenCalled();
  });

  it('leaves the name as plain text when no diff can be shown', () => {
    diffAvailable = false;
    renderBanner();

    expect(screen.queryByRole('button', { name: 'cart.js' })).toBeNull();
    expect(screen.getByText('Write to cart.js?')).toBeInTheDocument();
  });

  it('leaves a title with no file name alone', () => {
    // Bash has no file to link to; its title must render as it always did.
    diffAvailable = true;
    renderBanner({ ...writePermission, toolName: 'Bash', input: { command: 'ls' } });

    expect(screen.getByText('Run this command?')).toBeInTheDocument();
  });
});
