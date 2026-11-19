import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { DesktopPermissionCard, usesDesktopPermissionCard } from '../PermissionBanner/DesktopPermissionCard';
import { setLastAllowChoice } from '../PermissionBanner/lastAllowChoice';
import type { PendingPermission } from '../../../hooks/usePendingPermissions';

// #673: the Bash request drawn as the desktop app draws it.
const session = {
  inputMode: 'ask_before_edit' as string,
  availableModes: ['ask_before_edit', 'auto_edit', 'auto', 'plan'] as string[],
  setInputMode: vi.fn(),
};
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => session,
}));

const SUGGESTION = [
  {
    type: 'addRules',
    behavior: 'allow',
    destination: 'localSettings',
    rules: [{ toolName: 'Bash', ruleContent: 'ls:*' }],
  },
];

function permission(overrides: Partial<PendingPermission> = {}): PendingPermission {
  return {
    controlRequestId: 'ctrl-1',
    toolName: 'Bash',
    toolUseId: 'tool-1',
    input: { command: 'ls -la' },
    riskLevel: 'high',
    description: '',
    suppressAlwaysAllowRule: false,
    suggestions: SUGGESTION,
    ...overrides,
  } as PendingPermission;
}

function setup(p: PendingPermission = permission()) {
  const handlers = {
    onApprove: vi.fn(),
    onApproveAlways: vi.fn(),
    onDeny: vi.fn(),
  };
  render(
    <DesktopPermissionCard
      permission={p}
      subtitle="List files"
      preview={<pre data-testid="permission-command">ls -la</pre>}
      {...handlers}
    />,
  );
  return handlers;
}

beforeEach(() => {
  setLastAllowChoice('always');
  session.inputMode = 'ask_before_edit';
  session.availableModes = ['ask_before_edit', 'auto_edit', 'auto', 'plan'];
  session.setInputMode.mockClear();
});

describe('usesDesktopPermissionCard', () => {
  it('is for shell tools, and only outside the classic view', () => {
    expect(usesDesktopPermissionCard('Bash', 'normal')).toBe(true);
    expect(usesDesktopPermissionCard('PowerShell', 'verbose')).toBe(true);
    expect(usesDesktopPermissionCard('Bash', null)).toBe(false);
    expect(usesDesktopPermissionCard('Edit', 'normal')).toBe(true);
    expect(usesDesktopPermissionCard('Write', 'normal')).toBe(true);
    expect(usesDesktopPermissionCard('NotebookEdit', 'normal')).toBe(false);
    expect(usesDesktopPermissionCard('mcp__a__b', 'thinking')).toBe(true);
    expect(usesDesktopPermissionCard('WebFetch', 'normal')).toBe(true);
    expect(usesDesktopPermissionCard('Agent', 'normal')).toBe(true);
    expect(usesDesktopPermissionCard('Agent', null)).toBe(false);
  });
});

describe('DesktopPermissionCard — a fetch, a sub-agent and an MCP tool', () => {
  it('asks about the site that would be fetched', () => {
    setup(permission({ toolName: 'WebFetch', input: { url: 'https://example.com/docs/page', prompt: 'summarise' } }));
    expect(screen.getByTestId('desktop-permission-card')).toHaveTextContent('Allow Claude to fetch example.com?');
  });

  it('asks about the agent by its description', () => {
    setup(permission({ toolName: 'Agent', input: { description: 'Search the code', prompt: 'find it' } }));
    expect(screen.getByTestId('desktop-permission-card')).toHaveTextContent('Allow Claude to run an agent Search the code?');
  });

  it('asks about a tool of an MCP server by its name and the server', () => {
    setup(permission({ toolName: 'mcp__context7__resolve-library-id', input: { libraryName: 'react' } }));
    expect(screen.getByTestId('desktop-permission-card')).toHaveTextContent('Allow Claude to use resolve-library-id (context7)?');
  });
});

describe('DesktopPermissionCard — buttons', () => {
  it('shows the question, the description and the command', () => {
    setup();
    expect(screen.getByTestId('desktop-permission-card')).toHaveTextContent('Allow Claude to run this command?');
    expect(screen.getByText('List files')).toBeInTheDocument();
    expect(screen.getByTestId('permission-command')).toHaveTextContent('ls -la');
  });

  it('leads with "Always allow" when the CLI suggested a rule, and it sends the always answer', () => {
    const h = setup();
    const primary = screen.getByTestId('permission-primary');
    expect(primary).toHaveTextContent('Always allow');
    fireEvent.click(primary);
    expect(h.onApproveAlways).toHaveBeenCalledTimes(1);
    expect(h.onApprove).not.toHaveBeenCalled();
  });

  it('leads with "Allow once" when the CLI suggested nothing', () => {
    const h = setup(permission({ suggestions: undefined }));
    const primary = screen.getByTestId('permission-primary');
    expect(primary).toHaveTextContent('Allow once');
    fireEvent.click(primary);
    expect(h.onApprove).toHaveBeenCalledTimes(1);
    expect(h.onApproveAlways).not.toHaveBeenCalled();
  });

  it('leads with "Allow once" when the CLI said not to offer an always rule', () => {
    setup(permission({ suppressAlwaysAllowRule: true }));
    expect(screen.getByTestId('permission-primary')).toHaveTextContent('Allow once');
  });

  it('"Deny" denies', () => {
    const h = setup();
    fireEvent.click(screen.getByTestId('permission-deny'));
    expect(h.onDeny).toHaveBeenCalledTimes(1);
  });
});

describe('DesktopPermissionCard — the menu of a file change', () => {
  const edit = () =>
    permission({ toolName: 'Edit', input: { file_path: '/a/x.txt', old_string: 'a', new_string: 'b' }, suggestions: undefined });

  it('offers "Always allow" as switching the session to Accept edits, first, when the CLI suggested no rule', async () => {
    const order: string[] = [];
    session.setInputMode.mockImplementation(() => order.push('mode'));
    const h = setup(edit());
    h.onApprove.mockImplementation(() => {
      order.push('answer');
      return Promise.resolve();
    });
    fireEvent.click(screen.getByTestId('permission-more'));
    const item = screen.getByTestId('permission-menu-acceptEdits');
    expect(item).toHaveTextContent('Always allow');
    expect(item).toHaveTextContent('Accept edits');
    fireEvent.click(item);
    await waitFor(() => expect(session.setInputMode).toHaveBeenCalledWith('auto_edit'));
    // The answer reaches the CLI before the mode changes under it, or the CLI drops the call.
    expect(order).toEqual(['answer', 'mode']);
  });

  it('has no such item outside Ask before edits, or for a command', () => {
    session.inputMode = 'auto_edit';
    setup(edit());
    fireEvent.click(screen.getByTestId('permission-more'));
    expect(screen.queryByTestId('permission-menu-acceptEdits')).not.toBeInTheDocument();
    cleanup();
    session.inputMode = 'ask_before_edit';
    setup(permission());
    fireEvent.click(screen.getByTestId('permission-more'));
    expect(screen.queryByTestId('permission-menu-acceptEdits')).not.toBeInTheDocument();
  });
});

describe('DesktopPermissionCard — the menu', () => {
  it('lists "Allow once" and "Allow and switch to Auto" behind the arrow', () => {
    const h = setup();
    expect(screen.queryByTestId('permission-menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('permission-more'));
    expect(screen.getByTestId('permission-menu-once')).toHaveTextContent('Allow once');
    expect(screen.getByTestId('permission-menu-auto')).toHaveTextContent('Allow and switch to Auto');

    fireEvent.click(screen.getByTestId('permission-menu-once'));
    expect(h.onApprove).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('permission-menu')).not.toBeInTheDocument();
  });

  it('"Allow and switch to Auto" answers this call first and switches the mode after it', async () => {
    // The CLI drops the call it waits on when the mode changes under it, so the answer must reach it first.
    const order: string[] = [];
    session.setInputMode.mockImplementation(() => order.push('mode'));
    const h = setup();
    h.onApprove.mockImplementation(() => {
      order.push('answer');
      return Promise.resolve();
    });
    fireEvent.click(screen.getByTestId('permission-more'));
    fireEvent.click(screen.getByTestId('permission-menu-auto'));
    await waitFor(() => expect(session.setInputMode).toHaveBeenCalledWith('auto'));
    expect(h.onApprove).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['answer', 'mode']);
  });

  it('offers no Auto switch when already in Auto, or when the CLI does not allow Auto', () => {
    session.inputMode = 'auto';
    const first = render(
      <DesktopPermissionCard
        permission={permission()}
        preview={null}
        onApprove={vi.fn()}
        onApproveAlways={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByTestId('permission-more')[0]);
    expect(screen.queryByTestId('permission-menu-auto')).not.toBeInTheDocument();
    first.unmount();

    session.inputMode = 'ask_before_edit';
    session.availableModes = ['ask_before_edit', 'plan'];
    setup();
    fireEvent.click(screen.getByTestId('permission-more'));
    expect(screen.queryByTestId('permission-menu-auto')).not.toBeInTheDocument();
  });

  it('has no arrow at all when there is nothing behind it', () => {
    session.availableModes = ['ask_before_edit'];
    setup(permission({ suggestions: undefined }));
    expect(screen.queryByTestId('permission-more')).not.toBeInTheDocument();
  });
});

// #705: "Allow all … this session" behind the arrow, the way the classic prompt has it as its second line.
describe('DesktopPermissionCard — allowing a tool for the session', () => {
  function setupWith(
    p: PendingPermission,
    extra: { onApproveForSession?: () => void; onEnableSessionAllow?: () => Promise<boolean>; keyboardPaused?: boolean },
  ) {
    const handlers = { onApprove: vi.fn(), onApproveAlways: vi.fn(), onDeny: vi.fn() };
    render(
      <DesktopPermissionCard
        permission={p}
        subtitle="List files"
        preview={<pre data-testid="permission-command">ls -la</pre>}
        {...handlers}
        {...extra}
      />,
    );
    return handlers;
  }

  it('offers it for a command, saying it is every Bash command and until the session ends', () => {
    session.availableModes = ['ask_before_edit'];
    const onApproveForSession = vi.fn();
    const h = setupWith(permission({ suggestions: undefined }), { onApproveForSession });
    fireEvent.click(screen.getByTestId('permission-more'));
    const item = screen.getByTestId('permission-menu-session');
    expect(item).toHaveTextContent('Allow all Bash commands this session');
    expect(item).toHaveTextContent('until this session ends');

    fireEvent.click(item);
    expect(onApproveForSession).toHaveBeenCalledTimes(1);
    // It is its own answer: neither the one-off nor the rule the CLI suggested.
    expect(h.onApprove).not.toHaveBeenCalled();
    expect(h.onApproveAlways).not.toHaveBeenCalled();
  });

  it('is there beside "Always allow" when the CLI suggested a rule, which is narrower', () => {
    setupWith(permission(), { onApproveForSession: vi.fn() });
    fireEvent.click(screen.getByTestId('permission-more'));
    expect(screen.getByTestId('permission-menu-once')).toBeInTheDocument();
    expect(screen.getByTestId('permission-menu-session')).toBeInTheDocument();
  });

  it('names the tool for the others: a read, an MCP tool, a fetch', () => {
    session.availableModes = ['ask_before_edit'];
    const names: Array<[Partial<PendingPermission>, string]> = [
      [{ toolName: 'Read', input: { file_path: '/a/b.txt' } }, 'Allow all reads this session'],
      [{ toolName: 'mcp__context7__resolve-library-id', input: { libraryName: 'react' } }, 'resolve-library-id'],
      [{ toolName: 'WebFetch', input: { url: 'https://example.com' } }, 'Allow all WebFetch this session'],
    ];
    for (const [overrides, text] of names) {
      setupWith(permission({ suggestions: undefined, ...overrides }), { onApproveForSession: vi.fn() });
      fireEvent.click(screen.getByTestId('permission-more'));
      expect(screen.getByTestId('permission-menu-session')).toHaveTextContent(text);
      cleanup();
    }
  });

  it('is not offered when the card was given no way to answer it', () => {
    // A request the CLI keeps no rule for: the line would approve once and ask again on the next command.
    session.availableModes = ['ask_before_edit'];
    setupWith(permission({ suggestions: undefined, suppressAlwaysAllowRule: true }), {});
    expect(screen.queryByTestId('permission-more')).not.toBeInTheDocument();
  });

  it('is not a second line beside "Always allow" (Accept edits) on a file change, which does the same', () => {
    setupWith(
      permission({ toolName: 'Edit', input: { file_path: '/a/x.txt', old_string: 'a', new_string: 'b' }, suggestions: undefined }),
      { onApproveForSession: vi.fn() },
    );
    fireEvent.click(screen.getByTestId('permission-more'));
    expect(screen.getByTestId('permission-menu-acceptEdits')).toBeInTheDocument();
    expect(screen.queryByTestId('permission-menu-session')).not.toBeInTheDocument();
  });

  it('is offered for a file change where Accept edits is not on offer', () => {
    session.inputMode = 'plan';
    setupWith(
      permission({ toolName: 'Write', input: { file_path: '/a/x.txt', content: 'b' }, suggestions: undefined }),
      { onApproveForSession: vi.fn() },
    );
    fireEvent.click(screen.getByTestId('permission-more'));
    expect(screen.getByTestId('permission-menu-session')).toHaveTextContent('Allow all edits this session');
  });

  describe('for a request the CLI keeps no rule for (turning the switch on)', () => {
    const request = () => permission({ suggestions: undefined, suppressAlwaysAllowRule: true });

    it('allows this request once the switch is turned on', async () => {
      session.availableModes = ['ask_before_edit'];
      const onEnableSessionAllow = vi.fn().mockResolvedValue(true);
      const h = setupWith(request(), { onEnableSessionAllow });
      fireEvent.click(screen.getByTestId('permission-more'));
      expect(screen.getByTestId('permission-menu-enableSession')).toHaveTextContent('Shows a warning first');
      fireEvent.click(screen.getByTestId('permission-menu-enableSession'));
      await waitFor(() => expect(h.onApprove).toHaveBeenCalledTimes(1));
      expect(onEnableSessionAllow).toHaveBeenCalledTimes(1);
    });

    it('answers nothing when the warning is cancelled', async () => {
      session.availableModes = ['ask_before_edit'];
      const onEnableSessionAllow = vi.fn().mockResolvedValue(false);
      const h = setupWith(request(), { onEnableSessionAllow });
      fireEvent.click(screen.getByTestId('permission-more'));
      fireEvent.click(screen.getByTestId('permission-menu-enableSession'));
      await waitFor(() => expect(onEnableSessionAllow).toHaveBeenCalledTimes(1));
      await Promise.resolve();
      expect(h.onApprove).not.toHaveBeenCalled();
      expect(h.onDeny).not.toHaveBeenCalled();
    });
  });

  it('leaves its keys alone while the warning is on screen', () => {
    const h = setupWith(permission(), { keyboardPaused: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(h.onDeny).not.toHaveBeenCalled();
    expect(h.onApprove).not.toHaveBeenCalled();
  });
});

describe('DesktopPermissionCard — keys', () => {
  it('Escape closes an open menu and does nothing else', () => {
    const h = setup();
    fireEvent.click(screen.getByTestId('permission-more'));
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(screen.queryByTestId('permission-menu')).not.toBeInTheDocument();
    expect(h.onDeny).not.toHaveBeenCalled();
    // Marked as used, so the composer's "stop the response" Escape skips it.
    expect(event.defaultPrevented).toBe(true);
  });

  it('Escape with the menu closed denies', () => {
    const h = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(h.onDeny).toHaveBeenCalledTimes(1);
  });

  it('Cmd+Enter allows once; with Shift it takes the leading allow answer', () => {
    const h = setup();
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(h.onApprove).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true, shiftKey: true });
    expect(h.onApproveAlways).toHaveBeenCalledTimes(1);
  });

  it('leaves Cmd+Enter alone while the person is typing (it queues a message there)', () => {
    const h = setup();
    const box = document.createElement('textarea');
    document.body.appendChild(box);
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(h.onApprove).not.toHaveBeenCalled();
    expect(h.onDeny).not.toHaveBeenCalled();
    box.remove();
  });

  it('leads the next card with the allow answer picked last, the other one moves into the menu', () => {
    const first = setup();
    fireEvent.click(screen.getByTestId('permission-more'));
    fireEvent.click(screen.getByTestId('permission-menu-once'));
    expect(first.onApprove).toHaveBeenCalledTimes(1);
    cleanup();

    const second = setup();
    expect(screen.getByTestId('permission-primary')).toHaveTextContent('Allow once');
    fireEvent.click(screen.getByTestId('permission-more'));
    expect(screen.getByTestId('permission-menu-always')).toHaveTextContent('Always allow');
    fireEvent.click(screen.getByTestId('permission-menu-always'));
    expect(second.onApproveAlways).toHaveBeenCalledTimes(1);
  });
});
