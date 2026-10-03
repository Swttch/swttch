import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ShortcutContext } from '../shortcutCatalog';

const context: ShortcutContext = {
  mac: true,
  ideAttached: false,
  composer: {},
  voiceShortcut: null,
};
vi.mock('../useShortcutContext', () => ({ useShortcutContext: () => context }));

import { HelpModalHost } from '../HelpModalHost';
import { OPEN_HELP_EVENT, TOGGLE_HELP_EVENT } from '../events';
import { KeyboardRegistry } from '@/commandPalette/KeyboardRegistry';
import { isHelpShortcut } from '../helpShortcut';

const fire = (type: string) => act(() => void window.dispatchEvent(new CustomEvent(type)));

describe('HelpModalHost', () => {
  it('renders nothing until it is asked to open', () => {
    render(<HelpModalHost />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toggles on the shortcut event: first press opens, second press closes', () => {
    render(<HelpModalHost />);

    fire(TOGGLE_HELP_EVENT);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fire(TOGGLE_HELP_EVENT);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('only opens on the palette event, even when already open', () => {
    render(<HelpModalHost />);

    fire(OPEN_HELP_EVENT);
    fire(OPEN_HELP_EVENT);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<HelpModalHost />);
    fire(OPEN_HELP_EVENT);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is driven by the registry binding: Cmd+/ opens it and Cmd+/ again closes it', () => {
    const registry = new KeyboardRegistry();
    registry.register({
      id: 'open-help',
      match: isHelpShortcut,
      execute: async () => {
        window.dispatchEvent(new CustomEvent(TOGGLE_HELP_EVENT));
      },
    });
    render(<HelpModalHost />);
    const onKeyDown = (e: KeyboardEvent) => void registry.handleKeyEvent(e);
    window.addEventListener('keydown', onKeyDown);

    // The test platform is not a Mac, so the primary modifier is Ctrl.
    fireEvent.keyDown(window, { key: '/', code: 'Slash', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '/', code: 'Slash', ctrlKey: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    window.removeEventListener('keydown', onKeyDown);
  });
});
