import {describe, it, expect} from 'vitest';
import {render, waitFor, act} from '@testing-library/react';
import {useRef} from 'react';
import {CodeBlockWrapControls} from '../CodeBlockWrapControls';

/**
 * The fenced code blocks in an assistant message are the one place the #179
 * per-block toggle cannot wrap the block itself — Streamdown owns that subtree,
 * so the button is portalled into the header it already rendered and the fold
 * is a class on the `code-block` element.
 *
 * These cases assert that wiring against the DOM Streamdown actually produces
 * (captured from a real render): a `code-block` wrapper holding a
 * `code-block-header` with a button row, and a `code-block-body` <pre>.
 */
function CodeBlockFixture({count, content = 'x'}: {count: number; content?: string}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div ref={ref}>
        {Array.from({length: count}, (_, i) => (
          <div key={i} data-streamdown="code-block">
            <div data-streamdown="code-block-header">
              <span className="font-mono lowercase">json</span>
              <div>
                <button data-streamdown="code-block-copy-button">copy</button>
              </div>
            </div>
            <pre data-streamdown="code-block-body">
              <code>
                <span className="block">{'{"a": 1}'}</span>
              </code>
            </pre>
          </div>
        ))}
      </div>
      <CodeBlockWrapControls containerRef={ref} content={content} />
    </div>
  );
}

const buttonsIn = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));

describe('CodeBlockWrapControls (#179 follow-up)', () => {
  it('puts a button in every code block header', async () => {
    const {container} = render(<CodeBlockFixture count={3} />);

    await waitFor(() => expect(buttonsIn(container)).toHaveLength(3));

    // Beside Copy in the header, not floating over the code: a button inside
    // the <pre> would scroll away with the content.
    for (const btn of buttonsIn(container)) {
      expect(btn.closest('[data-streamdown="code-block-header"]')).not.toBeNull();
      expect(btn.closest('[data-streamdown="code-block-body"]')).toBeNull();
    }
  });

  it('leaves the copy button Streamdown rendered alone', async () => {
    const {container} = render(<CodeBlockFixture count={1} />);
    await waitFor(() => expect(buttonsIn(container)).toHaveLength(1));
    expect(
      container.querySelectorAll('[data-streamdown="code-block-copy-button"]'),
    ).toHaveLength(1);
  });

  it('folds only the block whose button was pressed', async () => {
    const {container} = render(<CodeBlockFixture count={2} />);
    await waitFor(() => expect(buttonsIn(container)).toHaveLength(2));

    const blocks = Array.from(
      container.querySelectorAll<HTMLElement>('[data-streamdown="code-block"]'),
    );
    // The setting is off in this environment, so both start opted out.
    expect(blocks.map((b) => b.classList.contains('soft-wrap-off'))).toEqual([true, true]);

    act(() => buttonsIn(container)[0].click());

    expect(blocks[0].classList.contains('soft-wrap')).toBe(true);
    expect(blocks[0].classList.contains('soft-wrap-off')).toBe(false);
    // The other block is untouched — this is a per-block control.
    expect(blocks[1].classList.contains('soft-wrap-off')).toBe(true);
  });

  it('flips back and forth', async () => {
    const {container} = render(<CodeBlockFixture count={1} />);
    await waitFor(() => expect(buttonsIn(container)).toHaveLength(1));
    const block = container.querySelector<HTMLElement>('[data-streamdown="code-block"]')!;

    act(() => buttonsIn(container)[0].click());
    expect(block.classList.contains('soft-wrap')).toBe(true);

    act(() => buttonsIn(container)[0].click());
    expect(block.classList.contains('soft-wrap-off')).toBe(true);
  });

  it('reaches blocks that appear after the first render', async () => {
    // Streamdown swaps the highlighted block in asynchronously and appends more
    // as the message streams, so a one-shot scan would miss them.
    const {container, rerender} = render(<CodeBlockFixture count={1} content="a" />);
    await waitFor(() => expect(buttonsIn(container)).toHaveLength(1));

    rerender(<CodeBlockFixture count={3} content="b" />);
    await waitFor(() => expect(buttonsIn(container)).toHaveLength(3));
  });
});
