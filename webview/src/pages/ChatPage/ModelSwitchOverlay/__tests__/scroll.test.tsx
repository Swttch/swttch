import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ModelInfo } from '@/types/slashCommand';

/**
 * Issue #314 — with a large catalog (the report had 16+ models) the picker grew
 * upward off the top of the viewport and the overflowing rows were unreachable:
 * they could not be scrolled to and could not be clicked.
 *
 * The panel opens with `bottom: 100%`, so it grows away from the composer and
 * nothing below clips it into a scroll container — the cap and the scroll have
 * to live on the panel itself. These lock that in, and lock that the header
 * stays put while only the rows scroll.
 */

const scrollIntoViewMock = vi.fn();
let mockModels: ModelInfo[] = [];
let mockSessionModel: string | null = null;

vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({
    sessionModel: mockSessionModel,
    setSessionModel: vi.fn(),
    appendMessage: vi.fn(),
  }),
}));
vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ settings: {}, updateSetting: vi.fn() }),
}));
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: { response: { response: { models: mockModels } } } }),
}));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ currentSessionId: null }),
}));
vi.mock('@/contexts/WorkingDirContext', () => ({ useWorkingDir: () => ({ workingDirectory: '/tmp' }) }));
vi.mock('@/contexts/FableProbeContext', () => ({
  useFableProbe: () => ({ probedAvailable: null, probeFableAvailability: vi.fn() }),
  shouldProbeFable: () => false,
}));
vi.mock('@/hooks/useVersionInfo', () => ({ useVersionInfo: () => ({ cliVersion: '2.1.170' }) }));
vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ send: () => ({ then: () => ({ catch: () => undefined }) }) }),
}));

import { ModelSwitchOverlay } from '../index';

/** A proxy catalog of the size that triggered the report. */
function largeCatalog(count: number): ModelInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    value: `proxy-model-${i}`,
    resolvedModel: `proxy-model-${i}`,
    displayName: `Proxy Model ${i}`,
    description: `Custom model ${i}`,
  }));
}

/** The outermost panel element, the one carrying the inline layout styles. */
function panel(): HTMLElement {
  // The header text is rendered inside the panel; walk up to the styled root.
  const header = screen.getByText('Select a model');
  return header.closest('[style*="position: absolute"]') as HTMLElement;
}

/** The element that actually scrolls the rows. */
function rowScroller(): HTMLElement {
  return screen.getByRole('button', { name: /Proxy Model 0/ }).parentElement as HTMLElement;
}

beforeEach(() => {
  scrollIntoViewMock.mockReset();
  // jsdom does not implement scrollIntoView; the picker calls it to reveal the
  // current model once the list scrolls.
  Element.prototype.scrollIntoView = scrollIntoViewMock;
  mockModels = largeCatalog(20);
  mockSessionModel = null;
});

describe('ModelSwitchOverlay with a catalog too tall for the viewport (issue #314)', () => {
  it('caps the panel height so it cannot run off the top of the viewport', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    // jsdom lays nothing out, so the measured room is 0 and the cap falls to
    // its floor. What matters is that a cap exists at all and that it is
    // finite — uncapped was the bug.
    const cap = parseFloat(panel().style.maxHeight);
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThanOrEqual(320);
  });

  it('scrolls the rows rather than clipping them away', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    // Asserted on the class, not getComputedStyle: vitest strips Tailwind's CSS
    // (see `css.include` in vitest.config.ts), so computed overflow reads ''
    // here for both the fixed and the broken build — a useless assertion.
    expect(rowScroller().className).toContain('overflow-y-auto');
    // The rows also need room to shrink inside the capped panel; without
    // min-h-0 a flex child refuses to go below its content height and the
    // overflow escapes the cap instead of scrolling.
    expect(rowScroller().className).toContain('min-h-0');
  });

  it('renders every model in the catalog, including the ones past the cap', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    // The last rows are the ones the reporter could not reach. They must exist
    // in the DOM — the cap is a viewport bound, not a truncation of the list.
    expect(screen.getByText('Proxy Model 19')).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBe(20);
  });

  it('keeps the header visible while the rows scroll under it', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    // Were the scroll on the panel instead of the list, the header would scroll
    // away with the rows and the picker would lose its title and shortcut hint.
    // The panel carries its layout inline, so this one reads the real property.
    expect(panel().style.overflowY).not.toBe('auto');
    expect(rowScroller().contains(screen.getByText('Select a model'))).toBe(false);
  });

  it('reveals the current model when it sits past the visible rows', () => {
    // Last row: without this the picker opens showing no ticked row, hiding
    // which model is running.
    mockSessionModel = 'proxy-model-19';
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });
});

describe('ModelSwitchOverlay height cap against the room above the composer', () => {
  /**
   * jsdom does no layout, so the panel measures 0 on its own. Stub the one
   * geometry read the sizing depends on — the panel's bottom edge, which is
   * pinned above the composer — to stand in for a window of a given height.
   */
  function renderWithRoomAbove(px: number) {
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return { ...orig.call(this), bottom: px } as DOMRect;
    };
    try {
      render(<ModelSwitchOverlay onClose={vi.fn()} />);
      return parseFloat(panel().style.maxHeight);
    } finally {
      Element.prototype.getBoundingClientRect = orig;
    }
  }

  it('opens to the full cap when the window has room to spare', () => {
    expect(renderWithRoomAbove(900)).toBe(320);
  });

  it('shrinks to the available room in a short window', () => {
    // The regression this guards: a fixed 320px panel in a short window slides
    // under the top bar and hides its own header. 8px is the padding kept from
    // the top of the window.
    expect(renderWithRoomAbove(200)).toBe(192);
  });

  it('never shrinks below a few usable rows', () => {
    // With almost no room the panel would otherwise collapse to nothing; a
    // floor keeps it scrollable rather than unusable.
    expect(renderWithRoomAbove(20)).toBe(120);
  });
});

describe('ModelSwitchOverlay with a catalog that fits (no regression)', () => {
  beforeEach(() => {
    mockModels = largeCatalog(3);
  });

  it('still lists every model', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    expect(screen.getAllByRole('button').length).toBe(3);
  });

  it('does not force a scrollbar onto a short list', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    // `auto` shows a scrollbar only when the content actually overflows, so a
    // short list looks exactly as it did before.
    expect(parseFloat(panel().style.maxHeight)).toBeLessThanOrEqual(320);
    expect(rowScroller().className).toContain('overflow-y-auto');
  });
});
