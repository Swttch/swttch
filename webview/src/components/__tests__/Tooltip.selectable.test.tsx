import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { Tooltip } from '../Tooltip';

type TippyReference = HTMLElement & { _tippy?: { state: { isVisible: boolean } } };

const isOpen = (reference: HTMLElement) => (reference as TippyReference)._tippy?.state.isVisible === true;

/** Hover the trigger the way a pointer does and wait out the show delay. */
async function hoverOpen(reference: HTMLElement) {
  fireEvent.mouseEnter(reference);
  await waitFor(() => expect(isOpen(reference)).toBe(true));
}

/** Move the pointer well away from both the trigger and the tooltip. */
function leaveFor(reference: HTMLElement) {
  fireEvent.mouseLeave(reference);
  fireEvent.mouseMove(document, { clientX: 900, clientY: 900 });
}

beforeEach(() => cleanup());

describe('Tooltip', () => {
  it('shows the full text when the trigger is hovered', async () => {
    render(<Tooltip content="a-very-long-file-name.mov"><span>a-very-lo...</span></Tooltip>);
    const reference = screen.getByText('a-very-lo...');

    await hoverOpen(reference);

    expect(screen.getByText('a-very-long-file-name.mov')).toBeInTheDocument();
  });

  it('closes by itself once the pointer has gone', async () => {
    render(<Tooltip content="name.mov"><span>trigger</span></Tooltip>);
    const reference = screen.getByText('trigger');
    await hoverOpen(reference);

    leaveFor(reference);

    await waitFor(() => expect(isOpen(reference)).toBe(false));
  });
});

describe('Tooltip selectable', () => {
  it('lets the text be selected, which the ordinary tooltip does not invite', async () => {
    render(<Tooltip content="name.mov" selectable><span>trigger</span></Tooltip>);
    await hoverOpen(screen.getByText('trigger'));

    expect(screen.getByText('name.mov')).toHaveClass('select-text');
  });

  it('stays open while a drag across the text is still going, even once the pointer has left it', async () => {
    render(<Tooltip content="name.mov" selectable><span>trigger</span></Tooltip>);
    const reference = screen.getByText('trigger');
    await hoverOpen(reference);

    fireEvent.mouseDown(screen.getByText('name.mov'));
    leaveFor(reference);
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(isOpen(reference)).toBe(true);
  });

  it('closes once the button is released away from the tooltip', async () => {
    render(<Tooltip content="name.mov" selectable><span>trigger</span></Tooltip>);
    const reference = screen.getByText('trigger');
    await hoverOpen(reference);

    fireEvent.mouseDown(screen.getByText('name.mov'));
    leaveFor(reference);
    await new Promise((resolve) => setTimeout(resolve, 400));
    fireEvent.mouseUp(document);

    await waitFor(() => expect(isOpen(reference)).toBe(false));
  });

  it('stays open when the button is released over the tooltip, so the selection can be copied', async () => {
    render(<Tooltip content="name.mov" selectable><span>trigger</span></Tooltip>);
    const reference = screen.getByText('trigger');
    await hoverOpen(reference);
    const text = screen.getByText('name.mov');

    fireEvent.mouseEnter(text);
    fireEvent.mouseDown(text);
    fireEvent.mouseUp(document);
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(isOpen(reference)).toBe(true);
  });

  it('closes on its own when it is not selectable, even with the button held', async () => {
    render(<Tooltip content="name.mov" interactive><span>trigger</span></Tooltip>);
    const reference = screen.getByText('trigger');
    await hoverOpen(reference);

    fireEvent.mouseDown(screen.getByText('name.mov'));
    leaveFor(reference);

    await waitFor(() => expect(isOpen(reference)).toBe(false));
  });
});
