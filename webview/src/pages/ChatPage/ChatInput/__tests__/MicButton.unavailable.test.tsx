import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MicButton } from '../MicButton';
import { DictationState } from '../hooks/useDictation';

/**
 * Acceptance for: "As a user whose machine cannot dictate, I want to see that
 * the microphone will not work before I press it, and to learn why when I do."
 *
 * Dimmed rather than hidden or disabled. Hidden takes the feature off the
 * screen for exactly the people who need to be told why they cannot have it,
 * and disabled swallows the press, leaving the reason in a hover tooltip that
 * nobody has to hover (#355).
 */

function press(button: HTMLElement) {
  // jsdom has no pointer capture; the component calls it on every press.
  (button as HTMLElement & { setPointerCapture: (id: number) => void }).setPointerCapture = vi.fn();
  fireEvent.pointerDown(button, { pointerId: 1 });
  fireEvent.pointerUp(button, { pointerId: 1 });
}

function renderMic(overrides: Partial<React.ComponentProps<typeof MicButton>> = {}) {
  const onStart = vi.fn();
  const onStop = vi.fn();
  render(
    <MicButton
      state={DictationState.Idle}
      level={0}
      shortcut="⌥D"
      onStart={onStart}
      onStop={onStop}
      {...overrides}
    />,
  );
  return { onStart, onStop, button: screen.getByRole('button') };
}

describe('MicButton when dictation cannot run', () => {
  beforeEach(() => vi.clearAllMocks());

  // classList, not a substring of className: the base classes already carry
  // `disabled:opacity-50`, so a substring check passes even when nothing dims.
  it('dims the button', () => {
    const { button } = renderMic({ unavailable: true });
    expect(button.classList.contains('opacity-50')).toBe(true);
  });

  // The whole point of dimming instead of disabling: the press has to land so
  // the banner can name the reason and offer the way out.
  it('still starts on a press, so the refusal can be explained', () => {
    const { onStart, button } = renderMic({ unavailable: true });
    press(button);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('says why in the accessible name', () => {
    const { button } = renderMic({ unavailable: true });
    expect(button.getAttribute('aria-label')).toMatch(/signed-in Claude account/i);
  });

  it('is not dimmed when dictation can run', () => {
    const { button } = renderMic();
    expect(button.classList.contains('opacity-50')).toBe(false);
    expect(button.getAttribute('aria-label')).toMatch(/tap or hold/i);
  });

  // A refused microphone is a different answer: there is nothing to explain on
  // press and nothing we can do about it, so that one stays truly disabled.
  it('keeps a denied microphone disabled and silent', () => {
    const { onStart, button } = renderMic({ micDenied: true });
    expect(button).toBeDisabled();
    press(button);
    expect(onStart).not.toHaveBeenCalled();
  });
});
