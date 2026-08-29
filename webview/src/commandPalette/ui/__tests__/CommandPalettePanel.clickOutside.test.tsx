import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { CommandPalettePanel } from '../CommandPalettePanel';
import { PanelItemType, PanelSectionId } from '@/types/commandPalette';
import type { PanelSection } from '@/types/commandPalette';

// The panel footer reads plugin/CLI versions over the bridge; the click-outside
// behaviour under test does not involve them, so a static stub keeps the test
// focused (and free of a QueryClient/Bridge provider tree).
vi.mock('@/hooks/useVersionInfo', () => ({
  useVersionInfo: () => ({
    pluginVersion: '0.0.0',
    cliVersion: null,
    requiresRestart: false,
    clientInfo: null,
    osInfo: null,
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// jsdom does not implement scrollIntoView; the panel calls it to keep the
// selected row visible.
Element.prototype.scrollIntoView = vi.fn();

const sections: PanelSection[] = [
  {
    id: PanelSectionId.SlashCommands,
    title: 'Slash Commands',
    showDividerAbove: false,
    items: [
      {
        id: 'clear',
        label: '/clear',
        type: PanelItemType.Command,
        name: '/clear',
        description: 'Clear conversation',
        action: vi.fn(),
      },
    ],
  },
];

function renderPanel(onClose: () => void) {
  return render(
    <CommandPalettePanel
      sections={sections}
      selectedSectionIndex={0}
      selectedItemIndex={0}
      filterQuery="clear"
      onItemClick={vi.fn()}
      onItemExecute={vi.fn()}
      onClose={onClose}
    />,
  );
}

describe('CommandPalettePanel click-outside', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not listen for outside clicks until the current event finishes dispatching (issue #373)', () => {
    // What breaks in the browser: picking a file from the mention dropdown is a
    // mousedown, and settling that mention hands the shared slot back to this
    // panel (issue #236), mounting it while that same mousedown is still
    // propagating to document. A listener attached during mount therefore caught
    // the very click that created the panel, saw a target outside itself, and
    // closed it again, so "/command @file " lost its panel on a mouse pick
    // while a keyboard pick kept it.
    //
    // Asserting on a dispatched event cannot express that here: React defers
    // effects out of the event under test, so the listener would land after the
    // dispatch either way and the bug would pass. What the fix actually
    // guarantees is the registration *timing*, so that is what this measures:
    // nothing is listening when mount returns, and the listener appears only
    // once the pending timer runs.
    const onClose = vi.fn();
    const addSpy = vi.spyOn(document, 'addEventListener');

    renderPanel(onClose);

    const mousedownRegistrations = () =>
      addSpy.mock.calls.filter(([type]) => type === 'mousedown').length;

    expect(mousedownRegistrations()).toBe(0);

    act(() => {
      vi.runAllTimers();
    });

    expect(mousedownRegistrations()).toBe(1);

    addSpy.mockRestore();
  });

  it('still closes on a mousedown that starts after it is open', () => {
    const onClose = vi.fn();
    renderPanel(onClose);

    // The deferred listener is in place once the current task yields.
    act(() => {
      vi.runAllTimers();
    });

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    act(() => {
      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    outside.remove();
  });

  it('does not close on a mousedown inside the panel', () => {
    const onClose = vi.fn();
    const { container } = renderPanel(onClose);

    act(() => {
      vi.runAllTimers();
    });

    const panel = container.querySelector('.slash-command-panel');
    expect(panel).not.toBeNull();
    act(() => {
      panel!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
