import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const session = vi.hoisted(() => ({ value: undefined as { cliSessionId?: string; cwd?: string; title?: string } | undefined }));
const viewMode = vi.hoisted(() => ({ value: null as string | null }));
const openSession = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const env = vi.hoisted(() => ({ value: 'browser' as string }));

vi.mock('@/hooks/useDesktopSession', () => ({
  useDesktopSession: () => session.value,
}));
vi.mock('../../transcriptViewMode', () => ({
  useTranscriptViewMode: () => viewMode.value,
}));
vi.mock('@/adapters', () => ({
  getAdapter: () => ({ type: env.value, openSession }),
}));

import { DesktopSessionLink, SessionFacts, desktopSessionIdOf } from '../DesktopSessionLink';

describe('desktopSessionIdOf', () => {
  it('reads the Desktop id from a link written the way the chat text writes it', () => {
    expect(desktopSessionIdOf('#local_f738a157-5d1d-4bae-9a6d-02752f403944')).toBe('local_f738a157-5d1d-4bae-9a6d-02752f403944');
    expect(desktopSessionIdOf('local_abc-123')).toBe('local_abc-123');
  });

  it('leaves every other link alone', () => {
    expect(desktopSessionIdOf(undefined)).toBeUndefined();
    expect(desktopSessionIdOf('#footnote-1')).toBeUndefined();
    expect(desktopSessionIdOf('https://example.com/local_abc')).toBeUndefined();
    expect(desktopSessionIdOf('#local_abc/with/slash')).toBeUndefined();
  });
});

describe('DesktopSessionLink', () => {
  beforeEach(() => {
    session.value = undefined;
    viewMode.value = null;
    env.value = 'browser';
    openSession.mockClear();
  });

  it('is a link that opens in a new tab once Desktop says which session it is, on the blue background', () => {
    session.value = { cliSessionId: 'cli-1', cwd: '/Users/me/project' };
    render(<DesktopSessionLink id="local_x">Mockup session</DesktopSessionLink>);
    const link = screen.getByRole('link', { name: 'Mockup session' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(link).toHaveClass('richInputChip');
    expect(link.getAttribute('href')).toMatch(/\/sessions\/cli-1\?workingDir=%2FUsers%2Fme%2Fproject$/);
  });

  it('is named by the session\'s own title in the Transcript view, and by the text in the classic chat', () => {
    session.value = { cliSessionId: 'cli-1', title: '* Issue 657 - history' };
    const { unmount } = render(<DesktopSessionLink id="local_x">Issue 657 session</DesktopSessionLink>);
    expect(screen.getByRole('link', { name: 'Issue 657 session' })).toBeInTheDocument();
    unmount();
    viewMode.value = 'normal';
    render(<DesktopSessionLink id="local_x">Issue 657 session</DesktopSessionLink>);
    expect(screen.getByRole('link', { name: '* Issue 657 - history' })).toBeInTheDocument();
  });

  it('leaves the opening to the link itself in a browser, where target=_blank puts it in a new tab', () => {
    session.value = { cliSessionId: 'cli-1', cwd: '/Users/me/project' };
    render(<DesktopSessionLink id="local_x">Mockup session</DesktopSessionLink>);
    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'Mockup session' }));
    expect(notPrevented).toBe(true);
    expect(openSession).not.toHaveBeenCalled();
  });

  it('opens that session through the adapter in the IDE, where the popup target is not handed over', () => {
    env.value = 'jetbrains';
    session.value = { cliSessionId: 'cli-1', cwd: '/Users/me/project' };
    render(<DesktopSessionLink id="local_x">Mockup session</DesktopSessionLink>);
    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'Mockup session' }));
    expect(notPrevented).toBe(false);
    expect(openSession).toHaveBeenCalledWith('cli-1', '/Users/me/project');
  });

  it('is the name alone on the same background, with nothing to open, while the session is not known', () => {
    render(<DesktopSessionLink id="local_x">Mockup session</DesktopSessionLink>);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Mockup session')).toHaveClass('richInputChip');
  });
});

describe('SessionFacts', () => {
  it('shows whether the session is archived, the folder it works in and when it was last active, in one row', () => {
    const { container } = render(
      <SessionFacts session={{ isArchived: true, cwd: '/Users/me/claude-code-gui-jetbrains', lastActivityAt: Date.now() - 4 * 60 * 60 * 1000 }} />,
    );
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getByText('claude-code-gui-jetbrains')).toBeInTheDocument();
    expect(screen.getByText('4 hours ago')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\/Users\/me/);
    // The tooltip draws the box; the row inside it must not draw a second one.
    expect(container.querySelector('.border')).toBeNull();
  });

  it('leaves out an archived mark for a session that is not archived, and reads a Windows folder too', () => {
    render(<SessionFacts session={{ isArchived: false, cwd: 'C:\\work\\app' }} />);
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
    expect(screen.getByText('app')).toBeInTheDocument();
  });

  it('draws nothing when it has nothing to show', () => {
    const { container } = render(<SessionFacts session={{ title: 'x' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
