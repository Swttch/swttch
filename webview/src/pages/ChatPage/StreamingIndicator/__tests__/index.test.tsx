import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StreamingIndicator } from '../index';

afterEach(cleanup);

describe('StreamingIndicator', () => {
  it('연결이 살아 있으면 카운트다운을 그리지 않는다', () => {
    const { container } = render(<StreamingIndicator />);
    expect(container.textContent).not.toMatch(/\(\d+s\)/);
  });

  it('남은 초를 동사 뒤에 붙여 보여준다', () => {
    // A lost backend otherwise looks exactly like a slow one: the same verbs
    // scrambling on forever, with nothing saying we noticed (#446).
    render(<StreamingIndicator countdownSeconds={7} />);
    expect(screen.getByText('(7s)')).toBeInTheDocument();
  });

  it('카운트다운은 스크램블되는 동사와 다른 요소에 둔다', () => {
    // The verb dissolves into dots and underscores between changes. Seconds
    // sharing that span would dissolve with it and stop being readable.
    const { container } = render(<StreamingIndicator countdownSeconds={3} />);
    const seconds = screen.getByText('(3s)');
    const verb = container.querySelector('.font-mono');

    expect(seconds).not.toBe(verb);
    expect(seconds.textContent).toBe('(3s)');
  });

  it('0초도 숨기지 않는다', () => {
    // `countdownSeconds && ...` would swallow 0 — the last frame before the turn
    // ends is exactly the one worth showing.
    render(<StreamingIndicator countdownSeconds={0} />);
    expect(screen.getByText('(0s)')).toBeInTheDocument();
  });
});
