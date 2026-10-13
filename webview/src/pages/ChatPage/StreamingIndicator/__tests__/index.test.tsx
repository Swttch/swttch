import type { ComponentProps } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { StreamingIndicator } from '../index';
import { ClaudeSettingsContext } from '@/contexts/ClaudeSettingsContext';
import { i18n } from '@/i18n';
import {
  DEFAULT_CLAUDE_SETTINGS,
  SpinnerVerbsMode,
  type SpinnerVerbsConfig,
} from '@/types/claude-settings';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function settingsContext(spinnerVerbs: SpinnerVerbsConfig | null) {
  const value: NonNullable<ComponentProps<typeof ClaudeSettingsContext.Provider>['value']> = {
    settings: { ...DEFAULT_CLAUDE_SETTINGS, spinnerVerbs },
    scopeSettings: {},
    isLoading: false,
    overrides: [],
    scope: 'global',
    setScope: vi.fn(),
    updateSetting: vi.fn(),
    updateSettingWithScope: vi.fn(),
    resetToGlobal: vi.fn(),
    refreshSettings: vi.fn(),
  };
  return (
    <ClaudeSettingsContext.Provider value={value}>
      <StreamingIndicator />
    </ClaudeSettingsContext.Provider>
  );
}

function renderWithSpinnerVerbs(spinnerVerbs: SpinnerVerbsConfig | null) {
  return render(settingsContext(spinnerVerbs));
}

describe('StreamingIndicator', () => {
  it('연결이 살아 있으면 카운트다운을 그리지 않는다', () => {
    const { container } = render(<StreamingIndicator />);
    expect(container.textContent).not.toMatch(/\(\d+s\)/);
  });

  it('남은 초를 동사 뒤에 붙여 보여준다', () => {
    // A lost backend otherwise looks exactly like a slow one: the same verbs
    // scrambling on forever, with nothing saying we noticed (#446).
    render(<StreamingIndicator countdownSeconds={7} />);
    expect(screen.getByText('(7s)')).toBeInTheDocument();
  });

  it('카운트다운은 스크램블되는 동사와 다른 요소에 둔다', () => {
    // The verb dissolves into dots and underscores between changes. Seconds
    // sharing that span would dissolve with it and stop being readable.
    const { container } = render(<StreamingIndicator countdownSeconds={3} />);
    const seconds = screen.getByText('(3s)');
    const verb = container.querySelector('.font-mono');

    expect(seconds).not.toBe(verb);
    expect(seconds.textContent).toBe('(3s)');
  });

  it('0초도 숨기지 않는다', () => {
    // `countdownSeconds && ...` would swallow 0 — the last frame before the turn
    // ends is exactly the one worth showing.
    render(<StreamingIndicator countdownSeconds={0} />);
    expect(screen.getByText('(0s)')).toBeInTheDocument();
  });

  it('재시도 진행을 보여준다', () => {
    // The CLI retries a failed request up to ten times over minutes. Without this the
    // spinner never changes and reads as frozen (#446).
    render(<StreamingIndicator apiRetry={{ attempt: 3, max: 10 }} />);
    expect(screen.getByText('(retry 3/10)')).toBeInTheDocument();
  });

  it('연결 끊김 카운트다운이 재시도 표시보다 우선한다', () => {
    // Once the socket is gone, retry progress is the last thing we heard rather than
    // what is happening now.
    render(<StreamingIndicator countdownSeconds={5} apiRetry={{ attempt: 3, max: 10 }} />);
    expect(screen.getByText('(5s)')).toBeInTheDocument();
    expect(screen.queryByText('(retry 3/10)')).toBeNull();
  });

  it('재시도가 없으면 아무것도 덧붙이지 않는다', () => {
    const { container } = render(<StreamingIndicator />);
    expect(container.textContent).not.toMatch(/retry/i);
  });

  describe('the spinnerVerbs setting (#548)', () => {
    it('shows only the verb when replace is given a single verb', () => {
      const { container } = renderWithSpinnerVerbs({
        mode: SpinnerVerbsMode.Replace,
        verbs: ['Processing'],
      });
      expect(container.querySelector('.font-mono')?.textContent).toBe('Processing...');
    });

    it('does not break when the verb is due to change and there is only one', async () => {
      // The rotation excludes the previous verb; with one verb that left nothing to pick.
      vi.useFakeTimers();
      const { container } = renderWithSpinnerVerbs({
        mode: SpinnerVerbsMode.Replace,
        verbs: ['Processing'],
      });

      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });

      expect(container.querySelector('.font-mono')?.textContent).toBe('Processing...');
    });

    it('picks from a new list even long after a one-verb list stopped changing', async () => {
      // With one verb the rotation picks the same word every time, and a timer chain that
      // only rearms when the word changes died after its first tick: a file edited minutes
      // into a turn was never picked up (found in the shipped build, #548).
      vi.useFakeTimers();
      // Time is let through a second at a time, each inside its own act: in a browser the
      // page redraws after every timer, and only a redraw arms the next one. One long
      // advance would skip those redraws and hide the chain breaking.
      const pass = async (seconds: number) => {
        for (let i = 0; i < seconds; i += 1) {
          await act(async () => {
            vi.advanceTimersByTime(1_000);
          });
        }
      };
      const { container, rerender } = renderWithSpinnerVerbs({
        mode: SpinnerVerbsMode.Replace,
        verbs: ['Processing'],
      });
      await pass(60);
      expect(container.querySelector('.font-mono')?.textContent).toBe('Processing...');

      rerender(settingsContext({ mode: SpinnerVerbsMode.Replace, verbs: ['Quokka-herding'] }));
      await pass(10);

      expect(container.querySelector('.font-mono')?.textContent).toBe('Quokka-herding...');
    });

    it('shows a built-in verb when the setting is absent', () => {
      const { container } = renderWithSpinnerVerbs(null);
      const text = container.querySelector('.font-mono')?.textContent ?? '';
      // "Processing" is itself one of the built-in verbs, so the check is membership in
      // the built-in list, not difference from the user's example.
      const builtIn = i18n.t('chat:streamingIndicator.verbs', { returnObjects: true }) as string[];
      expect(builtIn).toContain(text.replace(/\.\.\.$/, ''));
    });
  });
});
