import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const setSessionArchived = vi.fn();
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ setSessionArchived }),
}));
vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ArchivedSessionBar } from '../ArchivedSessionBar';

/** Stands where the chat input would be when the session is archived. */
describe('ArchivedSessionBar', () => {
  it('says the session is archived, and offers to bring it back', () => {
    render(<ArchivedSessionBar sessionId="s1" />);
    expect(screen.getByText('archivedSession.message')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'archivedSession.unarchive' }));
    expect(setSessionArchived).toHaveBeenCalledWith('s1', false);
  });

  it('lets the button go under the sentence when the window is narrow', () => {
    render(<ArchivedSessionBar sessionId="s1" />);
    const line = screen.getByText('archivedSession.message').parentElement as HTMLElement;
    expect(line.className).toContain('flex-wrap');
  });
});
