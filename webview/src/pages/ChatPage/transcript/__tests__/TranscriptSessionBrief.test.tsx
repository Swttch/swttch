import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClientEnv } from '@/shared';
import type { SessionParent } from '@/hooks/useSessionParent';
import type { LoadedMessageDto } from '../../../../types';
import { TranscriptSessionBrief } from '../TranscriptSessionBrief';

const parent = vi.hoisted(() => ({ value: undefined as SessionParent | undefined }));
vi.mock('@/hooks/useSessionParent', () => ({ useSessionParent: () => parent.value }));

const adapter = vi.hoisted(() => ({ type: 'browser', openSession: vi.fn(async () => undefined) }));
vi.mock('@/adapters', () => ({ getAdapter: () => adapter }));

const brief = { task: 'Say ok.', context: 'Background.' };
const message = { timestamp: '2026-11-11T09:00:00Z' } as unknown as LoadedMessageDto;

/**
 * The line over the first message of a session another session started: "Started … from <title>". The title is
 * a link to the session that started it.
 */
describe('the line over a started session\'s brief', () => {
  beforeEach(() => {
    adapter.type = ClientEnv.BROWSER;
    adapter.openSession.mockClear();
    parent.value = undefined;
  });

  it('says only that another session started it when nothing is known of the starter', () => {
    render(<TranscriptSessionBrief brief={brief} message={message} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('makes the starter\'s title a link to that session, with the folder it works in', () => {
    parent.value = { sessionId: 'boss-1', dir: '/work/app', title: 'Release manager' };
    render(<TranscriptSessionBrief brief={brief} message={message} />);
    const link = screen.getByRole('link', { name: 'Release manager' });
    expect(link.getAttribute('href')).toContain('/sessions/boss-1?workingDir=%2Fwork%2Fapp');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('opens the session through the adapter in the IDE, and does not fold the cards', () => {
    adapter.type = ClientEnv.JETBRAINS;
    parent.value = { sessionId: 'boss-1', dir: '/work/app', title: 'Release manager' };
    render(<TranscriptSessionBrief brief={brief} message={message} />);
    expect(screen.getByText('Say ok.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Release manager' }));
    expect(adapter.openSession).toHaveBeenCalledWith('boss-1', '/work/app');
    expect(screen.getByText('Say ok.')).toBeInTheDocument();
  });

  it('is plain text, not a link, when the starter has a title but no known session', () => {
    parent.value = { title: 'Release manager' };
    render(<TranscriptSessionBrief brief={brief} message={message} />);
    expect(screen.getByText('Release manager')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('folds the cards when the words around the link are pressed', () => {
    parent.value = { sessionId: 'boss-1', title: 'Release manager' };
    render(<TranscriptSessionBrief brief={brief} message={message} />);
    expect(screen.getByText('Say ok.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.queryByText('Say ok.')).toBeNull();
  });
});
