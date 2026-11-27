import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PermissionBanner } from '../PermissionBanner';
import type { PendingPermission } from '../../../hooks/usePendingPermissions';

// #705: what the new permission card offers for "allow for this session", and what it must NOT hand out.
//
// The boundary these cases guard: keeping "Allow all command in this session" on beyond one session is sponsor-only,
// and the card has no way to turn on anything of the kind itself. For a request the CLI keeps no rule for, the card
// only ever ASKS the shared switch (which warns, and gates the beyond-one-session part), and never answers in its place.
let mockInputMode = 'ask_before_edit';
vi.mock('../../../contexts/SessionContext', () => ({
  useSessionContext: () => ({
    inputMode: mockInputMode,
    availableModes: ['ask_before_edit'],
    setInputMode: vi.fn(),
    currentSessionId: 'session-1',
  }),
  useSessionContextOrNull: () => null,
}));

let mockAllowAll = false;
let mockConfirmOpen = false;
const mockSetAllowAll = vi.fn();
const mockRequestEnable = vi.fn(async () => true);
vi.mock('../../../contexts/AllowAllCommandsContext', () => ({
  useAllowAllCommands: () => ({
    isEnabled: () => mockAllowAll,
    setEnabled: mockSetAllowAll,
    requestEnable: mockRequestEnable,
    confirmOpen: mockConfirmOpen,
  }),
}));

vi.mock('../../../contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ stop: vi.fn() }),
}));

vi.mock('../../../hooks/useOpenDiffReview', () => ({
  useOpenDiffReview: () => vi.fn(async () => ({ kind: 'opened' })),
}));
vi.mock('../../../hooks/useAutoOpenDiffReview', () => ({
  useAutoOpenDiffReview: () => undefined,
}));

// The card is drawn in the desktop-style views; here that is the Normal view. `null` is the classic chat.
let mockViewMode: string | null = 'normal';
vi.mock('../message-renderers/transcriptViewMode', () => ({
  useTranscriptViewMode: () => mockViewMode,
}));

vi.mock('../../../contexts/WorkingDirContext', () => ({
  useWorkingDirOrNull: () => ({ workingDirectory: '/repo' }),
}));
vi.mock('../../../contexts/ClaudeSettingsContext', () => ({
  useClaudeHomeDir: () => '/home/me',
}));

const bash: PendingPermission = {
  controlRequestId: 'ctrl-1',
  toolName: 'Bash',
  toolUseId: 'tool-1',
  input: { command: 'ls' },
  riskLevel: 'high',
  description: 'Execute: ls',
  suppressAlwaysAllowRule: false,
};

function renderBanner(permission: PendingPermission) {
  const handlers = {
    onApprove: vi.fn(),
    onApproveForSession: vi.fn(),
    onApproveAlways: vi.fn(),
    onDeny: vi.fn(),
  };
  render(<PermissionBanner permission={permission} {...handlers} />);
  return handlers;
}

beforeEach(() => {
  mockViewMode = 'normal';
  mockInputMode = 'ask_before_edit';
  mockAllowAll = false;
  mockConfirmOpen = false;
  mockSetAllowAll.mockClear();
  mockRequestEnable.mockClear();
  mockRequestEnable.mockImplementation(async () => true);
});

describe('the new permission card — a request the CLI keeps a rule for', () => {
  it('has "Allow all Bash commands this session" behind the arrow, and it answers for the session', () => {
    const h = renderBanner(bash);
    expect(screen.getByTestId('desktop-permission-card')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('permission-more'));
    fireEvent.click(screen.getByTestId('permission-menu-session'));

    expect(h.onApproveForSession).toHaveBeenCalledTimes(1);
    expect(h.onApprove).not.toHaveBeenCalled();
    // The answer is for this session: nothing of "all sessions" is touched from here.
    expect(mockRequestEnable).not.toHaveBeenCalled();
    expect(mockSetAllowAll).not.toHaveBeenCalled();
  });
});

describe('the new permission card — a request the CLI keeps no rule for', () => {
  const suppressed: PendingPermission = { ...bash, suppressAlwaysAllowRule: true };

  it('offers no session line outside bypass mode, as the classic prompt leaves it out', () => {
    const h = renderBanner(suppressed);
    // Nothing is behind the arrow, so there is no arrow, and nothing answers for the session.
    expect(screen.queryByTestId('permission-more')).not.toBeInTheDocument();
    expect(screen.queryByTestId('permission-menu-session')).not.toBeInTheDocument();
    expect(h.onApproveForSession).not.toHaveBeenCalled();
    expect(mockRequestEnable).not.toHaveBeenCalled();
  });

  it('in bypass mode the line only asks for the switch, and allows this request once it is on', async () => {
    mockInputMode = 'bypass';
    const h = renderBanner(suppressed);

    fireEvent.click(screen.getByTestId('permission-more'));
    expect(screen.queryByTestId('permission-menu-session')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('permission-menu-enableSession'));

    await waitFor(() => expect(h.onApprove).toHaveBeenCalledTimes(1));
    // The warning (and what it switches on, sponsor gate included) is the shared switch's: asked once, set nowhere here.
    expect(mockRequestEnable).toHaveBeenCalledTimes(1);
    expect(mockSetAllowAll).not.toHaveBeenCalled();
    expect(h.onApproveForSession).not.toHaveBeenCalled();
  });

  it('allows nothing when the warning is declined', async () => {
    mockInputMode = 'bypass';
    mockRequestEnable.mockImplementation(async () => false);
    const h = renderBanner(suppressed);

    fireEvent.click(screen.getByTestId('permission-more'));
    fireEvent.click(screen.getByTestId('permission-menu-enableSession'));

    await waitFor(() => expect(mockRequestEnable).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(h.onApprove).not.toHaveBeenCalled();
    expect(h.onApproveForSession).not.toHaveBeenCalled();
    expect(h.onDeny).not.toHaveBeenCalled();
  });

  it('answers for the session once "Allow all command in this session" is already on', () => {
    mockInputMode = 'bypass';
    mockAllowAll = true;
    const h = renderBanner(suppressed);

    fireEvent.click(screen.getByTestId('permission-more'));
    expect(screen.queryByTestId('permission-menu-enableSession')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('permission-menu-session'));

    expect(h.onApproveForSession).toHaveBeenCalledTimes(1);
  });

  it('keeps Escape and Cmd+Enter from answering the card under the warning', () => {
    mockInputMode = 'bypass';
    mockConfirmOpen = true;
    const h = renderBanner(suppressed);

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });

    expect(h.onDeny).not.toHaveBeenCalled();
    expect(h.onApprove).not.toHaveBeenCalled();
  });
});

// #761: a file in a guarded .claude folder, which a rule for the edit tools does not cover.
describe('a file in a .claude folder', () => {
  const write = (file_path: string): PendingPermission => ({ ...bash, toolName: 'Write', input: { file_path, content: 'x' } });

  it('is offered the folder on the new card', () => {
    renderBanner(write('/repo/.claude/notes.md'));
    fireEvent.click(screen.getByTestId('permission-more'));
    expect(screen.getByTestId('permission-menu-session')).toHaveTextContent('project’s .claude folder');
  });

  it('is offered the folder as the second line of the classic prompt, for both folders', () => {
    mockViewMode = null;
    renderBanner(write('/home/me/.claude/settings.json'));
    expect(screen.getByText('Yes, allow edits in your ~/.claude folder this session')).toBeInTheDocument();
    expect(screen.queryByText('Yes, allow all edits this session')).not.toBeInTheDocument();
  });

  it('keeps "all edits" for any other file', () => {
    mockViewMode = null;
    renderBanner(write('/repo/src/a.ts'));
    expect(screen.getByText('Yes, allow all edits this session')).toBeInTheDocument();
  });
});
