import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutInput } from '../ShortcutInput';

/**
 * Acceptance for the rebinding control in: "As someone dictating, I want to
 * choose the key that starts and stops recording."
 */

describe('ShortcutInput', () => {
  let onChange: ReturnType<typeof vi.fn<(value: string) => void>>;

  beforeEach(() => {
    onChange = vi.fn<(value: string) => void>();
  });

  const setup = (value = 'Alt+D') => {
    render(<ShortcutInput value={value} onChange={onChange} ariaLabel="Shortcut" />);
    return screen.getByRole('button', { name: 'Shortcut' });
  };

  it('shows the current shortcut', () => {
    const button = setup('Alt+D');
    // Non-mac formatting in the test environment.
    expect(button.textContent).toContain('Alt+D');
  });

  it('waits for a key once pressed', () => {
    const button = setup();
    fireEvent.click(button);
    expect(button.textContent).toMatch(/press a key/i);
  });

  it('records the combination that was pressed', () => {
    const button = setup();
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'k', metaKey: true, shiftKey: true });
    expect(onChange).toHaveBeenCalledWith('Shift+Meta+K');
  });

  it('ignores modifiers on their own, which are the user still reaching', () => {
    const button = setup();
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Alt', altKey: true });
    expect(onChange).not.toHaveBeenCalled();
    // Still waiting, rather than having given up.
    expect(button.textContent).toMatch(/press a key/i);
  });

  it('refuses a bare key and says why', () => {
    // Binding 'd' alone would swallow the letter in the composer.
    const button = setup();
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'd' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/ctrl.*alt.*cmd/i)).toBeDefined();
  });

  it('cancels on Escape without changing anything', () => {
    const button = setup();
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Escape' });

    expect(onChange).not.toHaveBeenCalled();
    expect(button.textContent).toContain('Alt+D');
  });

  it('does nothing when keys are pressed before it is armed', () => {
    const button = setup();
    fireEvent.keyDown(button, { key: 'k', metaKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops waiting when the window loses focus', () => {
    // Otherwise it would keep listening for keys the user is now typing
    // somewhere else entirely.
    const button = setup();
    fireEvent.click(button);
    fireEvent.blur(window);
    expect(button.textContent).toContain('Alt+D');
  });
});
