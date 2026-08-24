/**
 * Typing into the panel's own content must not answer the question.
 *
 * The panel picks an option on a bare digit, which is right when the reader is
 * looking at the options and wrong when they are editing a proposed change
 * inside it. Measured in a browser: typing "15000" over a proposed threshold
 * approved the request on the "1" and wrote the ORIGINAL proposal, silently
 * discarding the edit.
 *
 * The reason the existing INPUT/TEXTAREA check missed it is that the editable
 * side of the review diff lives in a shadow root, so the platform retargets
 * `event.target` to the host element.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalPanel } from '../ApprovalPanel';
import type { OptionItem } from '../ApprovalPanel/OptionButton';

const options: OptionItem[] = [
  { key: '1', label: 'Yes' },
  { key: '2', label: 'Yes, for this session' },
  { key: '3', label: 'No' },
];

let onOptionSelect: ReturnType<typeof vi.fn<(index: number) => void>>;
let onCancel: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  onOptionSelect = vi.fn<(index: number) => void>();
  onCancel = vi.fn<() => void>();
});

function renderWithPreview(preview: React.ReactNode) {
  render(
    <ApprovalPanel
      title="Write to cart.js?"
      preview={preview}
      options={options}
      onOptionSelect={onOptionSelect}
      onCancel={onCancel}
    />,
  );
}

describe('ApprovalPanel — a digit typed into its preview is text, not an answer', () => {
  it('answers on a digit pressed outside any editor', () => {
    // The baseline the tests below are measured against.
    renderWithPreview(<div data-testid="preview">nothing editable here</div>);

    fireEvent.keyDown(window, { key: '1' });

    expect(onOptionSelect).toHaveBeenCalledWith(0);
  });

  it('does not answer on a digit typed into a contenteditable preview', () => {
    renderWithPreview(<div data-testid="editor" contentEditable suppressContentEditableWarning />);

    const editor = screen.getByTestId('editor');
    fireEvent.keyDown(editor, { key: '1', bubbles: true });

    expect(onOptionSelect).not.toHaveBeenCalled();
  });

  it('does not answer when the editor is nested inside the preview', () => {
    // The real one is several elements deep inside the renderer's markup.
    renderWithPreview(
      <div>
        <div>
          <span data-testid="editor" contentEditable suppressContentEditableWarning />
        </div>
      </div>,
    );

    fireEvent.keyDown(screen.getByTestId('editor'), { key: '1', bubbles: true });

    expect(onOptionSelect).not.toHaveBeenCalled();
  });

  it('does not answer on a digit typed inside a shadow root', () => {
    // The case that actually broke: the platform retargets event.target to the
    // host, so only the composed path still names the editable element.
    renderWithPreview(<div data-testid="host" />);

    const host = screen.getByTestId('host');
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('div');
    inner.setAttribute('contenteditable', 'true');
    shadow.appendChild(inner);

    fireEvent.keyDown(inner, { key: '1', bubbles: true, composed: true });

    expect(onOptionSelect).not.toHaveBeenCalled();
  });

  it('still cancels on Escape while editing', () => {
    // Escape is how the reader backs out of the whole question, and it stays
    // reachable from inside the diff.
    renderWithPreview(<div data-testid="editor" contentEditable suppressContentEditableWarning />);

    fireEvent.keyDown(screen.getByTestId('editor'), { key: 'Escape', bubbles: true });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
