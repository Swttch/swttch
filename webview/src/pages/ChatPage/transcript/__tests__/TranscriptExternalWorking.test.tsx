import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionActivity } from '@/shared';

// The line under the transcript of a session that runs although this screen is not the one running it (a session
// woken by the session-management MCP, one in the desktop app): it says the session works, so it does not look stopped.
let record: { activity: SessionActivity } | undefined;
vi.mock('@/contexts/BacklinkedSessionsContext', () => ({
  useBacklinkedSession: () => record,
}));

import { TranscriptExternalWorking } from '../TranscriptExternalWorking';

beforeEach(() => {
  record = undefined;
});

describe('TranscriptExternalWorking', () => {
  it('draws the working mark and the word for work while the session runs', () => {
    record = { activity: SessionActivity.Running };
    render(<TranscriptExternalWorking sessionId="child" />);

    const line = screen.getByRole('status');
    expect(line.querySelector('svg')).not.toBeNull();
    expect(line.textContent).not.toBe('');
  });

  it('draws nothing while the session does not run', () => {
    record = { activity: SessionActivity.Idle };
    render(<TranscriptExternalWorking sessionId="child" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('draws nothing for a session that is not known, or when there is no session', () => {
    render(<TranscriptExternalWorking sessionId="child" />);
    render(<TranscriptExternalWorking sessionId={null} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
