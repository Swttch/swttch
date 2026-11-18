import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptReplyFooter } from '../TranscriptReplyFooter';

vi.mock('@/i18n', () => ({
  i18n: { t: (key: string) => key },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/Tooltip', () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/ConfirmDialog/useConfirmDialog', () => ({ useConfirmDialog: () => ({ confirmDialog: null, confirm: vi.fn() }) }));
vi.mock('@/hooks/useReadAloud', () => ({ useReadAloud: () => ({ status: 'idle', toggle: vi.fn() }) }));

const SENT = '2026-11-18T03:00:00.000Z';

describe('TranscriptReplyFooter', () => {
  it('draws no dot between the icons and the time, as the desktop app does, and keeps the room the dot took', () => {
    render(<TranscriptReplyFooter copyText="hello" onFork={vi.fn()} timestamp={SENT} />);
    const gap = screen.getByTestId('reply-footer-gap');
    // Not drawn, yet still in the line, so the time stands where it stood with the dot.
    expect(gap.className).toContain('invisible');
    expect(gap.textContent).toBe('·');
  });

  it('has no room for a dot when there are no icons, only the time', () => {
    render(<TranscriptReplyFooter timestamp={SENT} />);
    expect(screen.queryByTestId('reply-footer-gap')).toBeNull();
  });
});
