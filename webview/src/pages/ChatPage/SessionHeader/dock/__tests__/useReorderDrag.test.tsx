import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DockItemId } from '@/types/settings';
import { useReorderDrag } from '../useReorderDrag';

const { TUNNEL, SETTINGS } = DockItemId;

/**
 * Two rows stacked vertically, geometry stubbed via getBoundingClientRect (jsdom
 * reports every rect as zero, so layout has to be supplied by hand). Row 0
 * (TUNNEL) spans y 0–50 (mid 25); row 1 (SETTINGS) spans y 50–100 (mid 75).
 */
const RECTS: Record<string, { top: number; height: number }> = {
  [`row-${TUNNEL}`]: { top: 0, height: 50 },
  [`row-${SETTINGS}`]: { top: 50, height: 50 },
};

function stubRect(el: HTMLElement, key: string) {
  const r = RECTS[key];
  el.getBoundingClientRect = () =>
    ({ top: r.top, bottom: r.top + r.height, height: r.height, left: 0, right: 0, width: 0, x: 0, y: r.top, toJSON: () => ({}) }) as DOMRect;
}

function Harness(props: { onDrop: (id: DockItemId, i: number) => void }) {
  const { drag, registerRow, setOrder, handlePointerDown } = useReorderDrag({ onDrop: props.onDrop });
  const order = [TUNNEL, SETTINGS];
  setOrder(order);

  return (
    <div>
      {order.map((id) => (
        <div
          key={id}
          data-testid={`row-${id}`}
          ref={(el) => {
            if (el) stubRect(el, `row-${id}`);
            registerRow(id, el);
          }}
          onPointerDown={(e) => handlePointerDown(e, id)}
        >
          {id}
        </div>
      ))}
      <span data-testid="dragging">{drag ? drag.id : 'none'}</span>
    </div>
  );
}

/**
 * jsdom has no PointerEvent, and `fireEvent.pointerDown` therefore builds a plain
 * Event whose `button`/`clientX`/`clientY` are all undefined (verified, not
 * assumed). Dispatching a MouseEvent supplies the coordinates the handlers read,
 * matching what a real browser delivers.
 */
function pointer(type: string, clientY: number, clientX = 0) {
  return new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
}

/** Press a row with real coordinates attached. */
function pressRow(id: DockItemId, clientY: number) {
  act(() => void screen.getByTestId(`row-${id}`).dispatchEvent(pointer('pointerdown', clientY)));
}

describe('useReorderDrag', () => {
  const onDrop = vi.fn();
  beforeEach(() => onDrop.mockReset());

  it('does not treat a press without movement as a drag', () => {
    render(<Harness onDrop={onDrop} />);
    pressRow(TUNNEL, 10);
    expect(screen.getByTestId('dragging').textContent).toBe('none');

    act(() => void window.dispatchEvent(pointer('pointerup', 10)));
    // A click must reach the row's own handler instead of committing a move.
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('does not start a drag from a right-click', () => {
    render(<Harness onDrop={onDrop} />);
    act(() =>
      void screen
        .getByTestId(`row-${TUNNEL}`)
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2, clientX: 0, clientY: 10 })),
    );
    act(() => void window.dispatchEvent(pointer('pointermove', 90)));
    expect(screen.getByTestId('dragging').textContent).toBe('none');
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('commits the drop position after the pointer travels past the threshold', () => {
    render(<Harness onDrop={onDrop} />);
    pressRow(TUNNEL, 10);
    // Past the second row's midpoint (75) → lands at the end of the list.
    act(() => void window.dispatchEvent(pointer('pointermove', 90)));
    expect(screen.getByTestId('dragging').textContent).toBe(TUNNEL);

    act(() => void window.dispatchEvent(pointer('pointerup', 90)));
    expect(onDrop).toHaveBeenCalledWith(TUNNEL, 2);
  });

  it('abandons the drag on Escape without committing', () => {
    render(<Harness onDrop={onDrop} />);
    pressRow(TUNNEL, 10);
    act(() => void window.dispatchEvent(pointer('pointermove', 90)));
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(screen.getByTestId('dragging').textContent).toBe('none');
    expect(onDrop).not.toHaveBeenCalled();
  });

  // A pointer released outside the menu must not leave a row stuck to the cursor.
  it('clears the drag on pointercancel without committing', () => {
    render(<Harness onDrop={onDrop} />);
    pressRow(TUNNEL, 10);
    act(() => void window.dispatchEvent(pointer('pointermove', 90)));
    act(() => void window.dispatchEvent(pointer('pointercancel', 90)));
    expect(screen.getByTestId('dragging').textContent).toBe('none');
    expect(onDrop).not.toHaveBeenCalled();
  });
});
