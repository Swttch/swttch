import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpModal } from '../HelpModal';
import type { ShortcutContext } from '../shortcutCatalog';

const context: ShortcutContext = {
  mac: true,
  ideAttached: false,
  composer: {},
  voiceShortcut: 'Alt+D',
};

describe('HelpModal', () => {
  it('opens on the Shortcuts tab, selected and wired to its panel', () => {
    render(<HelpModal context={context} onClose={vi.fn()} />);

    const tab = screen.getByRole('tab', { name: 'Shortcuts' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab')).toHaveLength(1);

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('lists the shortcuts for the platform, descriptions beside key caps', () => {
    render(<HelpModal context={context} onClose={vi.fn()} />);

    expect(screen.getByText('Open a new chat tab')).toBeInTheDocument();
    expect(screen.getByText('Send the message')).toBeInTheDocument();
    expect(screen.getAllByText('⌘').length).toBeGreaterThan(0);
    expect(screen.getByText('Edit with Control keys')).toBeInTheDocument();
    // The IDE rows are not offered without an IDE.
    expect(screen.queryByText('Open Claude Code from the IDE')).not.toBeInTheDocument();
  });

  it('hides the macOS-only group elsewhere', () => {
    render(<HelpModal context={{ ...context, mac: false }} onClose={vi.fn()} />);

    expect(screen.queryByText('Edit with Control keys')).not.toBeInTheDocument();
    expect(screen.getAllByText('Ctrl').length).toBeGreaterThan(0);
  });

  it('moves focus into the dialog and gives it back when it closes', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    const { unmount } = render(<HelpModal context={context} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveFocus();

    unmount();
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<HelpModal context={context} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the X button', () => {
    const onClose = vi.fn();
    render(<HelpModal context={context} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the scrim is clicked, but not when the dialog is', () => {
    const onClose = vi.fn();
    render(<HelpModal context={context} onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('help-modal-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
