import { describe, it, expect, beforeEach } from 'vitest';
import { render, renderHook, screen, fireEvent } from '@testing-library/react';

import {
  SESSION_MANAGER_NOTICE_ID,
  SessionManagerNoticeCard,
  sessionManagerNotice,
  useSessionManagerNoticeRelevant,
} from '../sessionManagerNotice';
import { readInlineDismissed } from '../dismissed';

describe('session manager notice', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is shown until it is closed', () => {
    expect(renderHook(() => useSessionManagerNoticeRelevant()).result.current).toBe(true);
  });

  it('stays closed once it was closed', () => {
    render(<SessionManagerNoticeCard />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(readInlineDismissed(SESSION_MANAGER_NOTICE_ID)).toBe(true);
    expect(renderHook(() => useSessionManagerNoticeRelevant()).result.current).toBe(false);
  });

  it('opens the details window and closes it again', () => {
    render(<SessionManagerNoticeCard />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /learn more/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Change a session’s parent session/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /^close$/i }).pop()!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('competes for the empty chat', () => {
    expect(sessionManagerNotice.id).toBe(SESSION_MANAGER_NOTICE_ID);
  });
});
