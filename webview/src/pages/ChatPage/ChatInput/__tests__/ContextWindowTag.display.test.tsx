import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextWindowTag } from '../ContextWindowTag';
import { ContextBadgeDisplay } from '@/shared';

/**
 * #328: what the badge writes beside its ring follows the contextBadgeDisplay
 * setting. The window size is only known after a turn ends, so each choice has to
 * say what it does while the size is still unknown.
 */

let usage: { totalTokens: number; contextWindow: number; maxOutputTokens: number } | null = null;
let settings: Record<string, unknown> = {};

vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ contextWindowUsage: usage }),
}));
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings, updateSetting: vi.fn() }),
}));
vi.mock('@/hooks/useContextWindowProbe', () => ({ useContextWindowProbe: () => undefined }));

function badgeText(): string {
  return (screen.getByRole('button').textContent ?? '').trim();
}

describe('ContextWindowTag display (#328)', () => {
  beforeEach(() => {
    usage = null;
    settings = {};
  });

  describe('with the window size known (81k of 1M)', () => {
    beforeEach(() => {
      usage = { totalTokens: 81_000, contextWindow: 1_000_000, maxOutputTokens: 0 };
    });

    it('writes the percentage by default', () => {
      render(<ContextWindowTag />);
      expect(badgeText()).toBe('8%');
    });

    it('writes the token count when the setting says tokens', () => {
      settings = { contextBadgeDisplay: ContextBadgeDisplay.TOKENS };
      render(<ContextWindowTag />);
      expect(badgeText()).toBe('81k');
    });

    it('writes nothing beside the ring when the setting says none', () => {
      settings = { contextBadgeDisplay: ContextBadgeDisplay.NONE };
      render(<ContextWindowTag />);
      expect(badgeText()).toBe('');
    });
  });

  describe('with the window size still unknown (a reopened chat)', () => {
    beforeEach(() => {
      usage = { totalTokens: 81_000, contextWindow: 0, maxOutputTokens: 0 };
    });

    it('does not invent a percentage, nor swap in the token count, under percent', () => {
      settings = { contextBadgeDisplay: ContextBadgeDisplay.PERCENT };
      render(<ContextWindowTag />);
      expect(badgeText()).toBe('');
    });

    it('still writes the token count under tokens, which needs no window', () => {
      settings = { contextBadgeDisplay: ContextBadgeDisplay.TOKENS };
      render(<ContextWindowTag />);
      expect(badgeText()).toBe('81k');
    });
  });

  it('writes 0% under percent when nothing is used yet, even without the window', () => {
    usage = { totalTokens: 0, contextWindow: 0, maxOutputTokens: 0 };
    render(<ContextWindowTag />);
    expect(badgeText()).toBe('0%');
  });

  // jsdom lays nothing out, so this pins the classes the sizing hangs on: the box follows its
  // widest part, the sentences do not widen it, and a choice never breaks inside its word.
  describe.each([
    ['known', 1_000_000],
    ['still unknown', 0],
  ])('the tooltip with the window size %s (#736)', (_state, contextWindow) => {
    beforeEach(async () => {
      usage = { totalTokens: 81_000, contextWindow, maxOutputTokens: 0 };
      render(<ContextWindowTag />);
      await userEvent.hover(screen.getByRole('button'));
    });

    it('lets the box grow with the display switch, up to the window width', async () => {
      const box = (await screen.findByRole('radiogroup')).closest('.shadow-lg');
      expect(box).toHaveClass('w-max', 'max-w-[calc(100vw/var(--ui-zoom,1)-1rem)]');
      expect(box).not.toHaveClass('max-w-[260px]');
    });

    it('keeps the sentences from widening the box, and lets them fill it', async () => {
      const box = (await screen.findByRole('radiogroup')).closest('.shadow-lg');
      const sentences = box?.querySelector('p')?.parentElement;
      expect(sentences).toHaveClass('w-max', 'max-w-[calc(260px-1.5rem-2px)]', 'min-w-full');
    });

    it('never breaks a choice inside its word', async () => {
      await screen.findByRole('radiogroup');
      for (const choice of screen.getAllByRole('radio')) expect(choice).toHaveClass('whitespace-nowrap');
    });
  });
});
