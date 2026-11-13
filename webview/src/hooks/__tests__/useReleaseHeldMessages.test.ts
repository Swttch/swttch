import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReleaseHeldMessages } from '../useReleaseHeldMessages';

// #673: what is held under a permission card goes out when the card is answered, and not before.
function setup(waiting: boolean) {
  const release = vi.fn();
  const view = renderHook((props: { waiting: boolean }) => useReleaseHeldMessages(props.waiting, release), {
    initialProps: { waiting },
  });
  return { release, ...view };
}

describe('useReleaseHeldMessages', () => {
  it('releases once, when the card goes away', () => {
    const { release, rerender } = setup(true);
    expect(release).not.toHaveBeenCalled();

    rerender({ waiting: false });
    expect(release).toHaveBeenCalledTimes(1);

    rerender({ waiting: false });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does nothing while no card has been up', () => {
    const { release, rerender } = setup(false);
    rerender({ waiting: false });
    expect(release).not.toHaveBeenCalled();
  });

  it('releases again for the next card', () => {
    const { release, rerender } = setup(true);
    rerender({ waiting: false });
    rerender({ waiting: true });
    rerender({ waiting: false });
    expect(release).toHaveBeenCalledTimes(2);
  });
});
