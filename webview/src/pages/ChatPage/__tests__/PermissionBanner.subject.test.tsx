import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PermissionBanner } from '../PermissionBanner';
import { permissionPreview, permissionSubtitle } from '../PermissionBanner/PermissionPreview';
import type { PendingPermission } from '../../../hooks/usePendingPermissions';

// #673: the prompt itself says what it is about. These cases are about what is
// drawn between the heading and the options; the surrounding state is stubbed the
// same way PermissionBanner.test.tsx does.
vi.mock('../../../contexts/SessionContext', () => ({
  useSessionContext: () => ({ inputMode: 'ask_before_edit', currentSessionId: 'session-1' }),
  useSessionContextOrNull: () => null,
}));
vi.mock('../../../contexts/AllowAllCommandsContext', () => ({
  useAllowAllCommands: () => ({
    isEnabled: () => false,
    setEnabled: vi.fn(),
    requestEnable: vi.fn(async () => true),
    confirmOpen: false,
  }),
}));
vi.mock('../../../contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ stop: vi.fn() }),
}));
vi.mock('../../../hooks/useOpenDiffReview', () => ({
  useOpenDiffReview: () => vi.fn(async () => ({ kind: 'opened' })),
}));
vi.mock('../../../hooks/useAutoOpenDiffReview', () => ({
  useAutoOpenDiffReview: vi.fn(),
}));

function permission(toolName: string, input: unknown): PendingPermission {
  return {
    controlRequestId: 'ctrl-1',
    toolName,
    toolUseId: 'tool-1',
    input: input as Record<string, unknown>,
    riskLevel: 'high',
    description: '',
    suppressAlwaysAllowRule: false,
  };
}

function renderFor(toolName: string, input: unknown) {
  return render(
    <PermissionBanner
      permission={permission(toolName, input)}
      onApprove={vi.fn()}
      onApproveForSession={vi.fn()}
      onDeny={vi.fn()}
    />,
  );
}

describe('PermissionBanner — shell requests show the command', () => {
  it('shows the command and the one-line description of a Bash request', () => {
    renderFor('Bash', {
      command: 'mkdir -p /tmp/a && touch /tmp/a/b.txt',
      description: 'Create directory and empty file',
    });

    expect(screen.getByTestId('permission-command')).toHaveTextContent('mkdir -p /tmp/a && touch /tmp/a/b.txt');
    expect(screen.getByText('Create directory and empty file')).toBeInTheDocument();
  });

  it('shows the whole of a long multi-line command, never a clipped part', () => {
    const command = Array.from({ length: 40 }, (_, i) => `echo line-${i}`).join(' &&\n');
    renderFor('Bash', { command });

    const box = screen.getByTestId('permission-command');
    expect(box).toHaveTextContent('echo line-0');
    expect(box).toHaveTextContent('echo line-39');
  });

  it('shows a PowerShell request the same way', () => {
    renderFor('PowerShell', { command: 'Get-ChildItem -Recurse', description: 'List files' });

    expect(screen.getByTestId('permission-command')).toHaveTextContent('Get-ChildItem -Recurse');
    expect(screen.getByText('List files')).toBeInTheDocument();
  });

  it('draws no description line when the request has none, or a blank one', () => {
    const { unmount } = renderFor('Bash', { command: 'ls' });
    expect(screen.getByTestId('permission-command')).toHaveTextContent('ls');
    unmount();

    renderFor('Bash', { command: 'ls', description: '   ' });
    expect(screen.queryByText('   ')).not.toBeInTheDocument();
  });

  it('draws nothing extra when the command is missing, empty or not a string', () => {
    for (const input of [{}, { command: '' }, { command: '   ' }, { command: 42 }, { command: ['ls'] }]) {
      const { unmount } = renderFor('Bash', input);
      expect(screen.queryByTestId('permission-command')).not.toBeInTheDocument();
      // The question is still there and still answerable.
      expect(screen.getByText('Run this command?')).toBeInTheDocument();
      unmount();
    }
  });

  it('survives an input that is not a plain object', () => {
    for (const input of ['ls', 7, ['ls']]) {
      expect(() => renderFor('Bash', input).unmount()).not.toThrow();
    }
    // The helpers themselves also take a missing input (the heading code around
    // them reads `input` unguarded, as it always has, so this is asked of them
    // directly).
    for (const tool of ['Bash', 'PowerShell', 'mcp__a__b', 'WebFetch']) {
      expect(permissionPreview(tool, null)).toBeNull();
      expect(permissionPreview(tool, undefined)).toBeNull();
      expect(permissionSubtitle(tool, null)).toBeUndefined();
    }
  });
});

describe('PermissionBanner — MCP and other tools show their arguments', () => {
  it('lists the arguments of an MCP request, one field per key', () => {
    renderFor('mcp__idea__create_new_file', { pathInProject: 'README.md', text: 'hello' });

    const args = screen.getByTestId('permission-arguments');
    expect(args).toHaveTextContent('README.md');
    expect(args).toHaveTextContent('hello');
  });

  it('shows non-string values rather than crashing (path: ["greeter","name"])', () => {
    expect(() =>
      renderFor('mcp__idea__xdebug_get_value_by_path', {
        sessionId: 'App',
        path: ['greeter', 'name'],
        depth: 3,
        deep: { a: { b: [1, { c: null }] } },
        flag: false,
      }),
    ).not.toThrow();

    const args = screen.getByTestId('permission-arguments');
    expect(args).toHaveTextContent('greeter, name');
    expect(args).toHaveTextContent('3');
  });

  it('shows the arguments of a tool that has no prompt of its own (WebFetch)', () => {
    renderFor('WebFetch', { url: 'https://example.com', prompt: 'the title' });

    expect(screen.getByTestId('permission-arguments')).toHaveTextContent('https://example.com');
  });

  it('draws nothing extra when an MCP request carries no arguments', () => {
    renderFor('mcp__idea__list_projects', {});

    expect(screen.queryByTestId('permission-arguments')).not.toBeInTheDocument();
    expect(screen.queryByTestId('permission-command')).not.toBeInTheDocument();
  });
});

describe('PermissionBanner — prompts that already say what they are about are left alone', () => {
  it.each([
    ['Edit', { file_path: '/tmp/x/cart.js', old_string: 'a', new_string: 'b' }],
    ['Write', { file_path: '/tmp/x/cart.js', content: 'x' }],
    ['Delete', { file_path: '/tmp/x/cart.js' }],
    ['Read', { file_path: '/tmp/x/cart.js' }],
    ['NotebookEdit', { notebook_path: '/tmp/x/n.ipynb', new_source: 'x' }],
  ])('adds nothing to a %s request', (toolName, input) => {
    renderFor(toolName, input);

    expect(screen.queryByTestId('permission-command')).not.toBeInTheDocument();
    expect(screen.queryByTestId('permission-arguments')).not.toBeInTheDocument();
  });

  it('keeps the Workflow description and notice, and adds no arguments', () => {
    renderFor('Workflow', { workflow: 'review', description: 'Review the change' });

    expect(screen.getByText('Review the change')).toBeInTheDocument();
    expect(screen.queryByTestId('permission-arguments')).not.toBeInTheDocument();
  });

  it('keeps the options as they were: Yes, session, No and the reply box', () => {
    renderFor('Bash', { command: 'ls', description: 'List' });

    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Yes, allow all commands this session')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Tell Claude what to do instead')).toBeInTheDocument();
  });
});
