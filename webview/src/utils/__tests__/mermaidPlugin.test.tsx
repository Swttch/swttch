import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { StreamingMessage } from '../../pages/ChatPage/StreamingMessage';

/**
 * A ```mermaid fence in a reply is drawn as a diagram instead of being shown as
 * source (issue #556).
 *
 * mermaid itself cannot lay a chart out in jsdom (it measures text with
 * `getBBox`), so the library is replaced by a stub that hands back a fixed SVG.
 * What is under test is the wiring around it: the fence reaches mermaid, the
 * SVG lands in the reply, and mermaid is set up the way a chat needs.
 */
const mermaidApi = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (_id: string, _source: string) => ({
    svg: '<svg data-testid="mermaid-svg"><g></g></svg>',
  })),
}));

vi.mock('mermaid', () => ({ default: mermaidApi }));

const CHART = ['graph LR', '  A["start"] --> B["end"]'].join('\n');
const REPLY = ['Here is the flow:', '', '```mermaid', CHART, '```'].join('\n');

// Streamdown waits for a diagram to scroll into view before drawing it. The
// shared setup stubs IntersectionObserver with one that never fires, which
// would leave every diagram here as an empty placeholder; this one reports the
// element as visible as soon as it is watched.
class VisibleIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element): void {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(() => {
  mermaidApi.initialize.mockClear();
  mermaidApi.render.mockClear();
  vi.stubGlobal('IntersectionObserver', VisibleIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
});

async function renderReply(content: string = REPLY) {
  const view = render(<StreamingMessage content={content} isStreaming={false} />);
  await waitFor(() => {
    expect(view.container.querySelector('[data-testid="mermaid-svg"]')).toBeTruthy();
  });
  return view;
}

describe('mermaid diagrams in a reply (issue #556)', () => {
  it('draws a mermaid fence as a diagram', async () => {
    const { container } = await renderReply();

    // Streamdown hands over the fence body with its trailing newline.
    const [, source] = mermaidApi.render.mock.calls[0];
    expect(source.trim()).toBe(CHART);
    // The source is not left behind as a highlighted code block.
    expect(container.querySelector('[data-streamdown="code-block-body"]')).toBeNull();
  });

  it('runs mermaid in strict mode, so a chart cannot carry script or click handlers', async () => {
    await renderReply();

    expect(mermaidApi.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: 'strict', startOnLoad: false }),
    );
  });

  it('uses the dark mermaid theme while the IDE is dark', async () => {
    document.documentElement.classList.add('dark');
    await renderReply();

    expect(mermaidApi.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }));
  });

  it('uses the default mermaid theme while the IDE is light', async () => {
    await renderReply();

    expect(mermaidApi.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'default' }));
  });

  it('redraws a diagram already on screen when the IDE switches theme', async () => {
    await renderReply();
    expect(mermaidApi.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'default' }));
    const drawsBefore = mermaidApi.render.mock.calls.length;

    // mermaid writes its colours into the SVG, so a chart drawn in one theme
    // stays in it until it is drawn again.
    act(() => {
      document.documentElement.classList.add('dark');
    });

    await waitFor(() => {
      expect(mermaidApi.render.mock.calls.length).toBeGreaterThan(drawsBefore);
    });
    expect(mermaidApi.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }));
  });

  it('offers no download button, which a JCEF webview cannot save from', async () => {
    const { container } = await renderReply();

    const labels = [...container.querySelectorAll('button')].map(
      (b) => `${b.getAttribute('title') ?? ''} ${b.getAttribute('aria-label') ?? ''}`.toLowerCase(),
    );
    expect(labels.some((l) => l.includes('download'))).toBe(false);
  });
});
