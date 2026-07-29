import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { ZoomProvider, useZoom, ZOOM_INDICATOR_HOLD_MS } from '../ZoomContext';
import { SettingKey } from '@/types/settings';
import { ZOOM_DEFAULT } from '@/utils/zoom';

let mockZoomLevel: number = ZOOM_DEFAULT;
// Mirrors the real SettingsContext: a saved value becomes the next read, so
// ZoomProvider's `level` (derived from `settings`) advances the same way it
// does in the app instead of staying frozen at a static mock value.
const mockUpdateSetting = vi.fn((_key: unknown, value: number) => {
  mockZoomLevel = value;
});

vi.mock('../SettingsContext', () => ({
  useSettings: () => ({
    settings: { [SettingKey.ZOOM_LEVEL]: mockZoomLevel },
    updateSetting: mockUpdateSetting,
  }),
}));

function Probe() {
  const { level, isIndicatorVisible, zoomIn, zoomOut, reset, holdIndicator, releaseIndicator } = useZoom();
  return (
    <div>
      <span data-testid="level">{level}</span>
      <span data-testid="visible">{String(isIndicatorVisible)}</span>
      <button onClick={zoomIn}>in</button>
      <button onClick={zoomOut}>out</button>
      <button onClick={reset}>reset</button>
      <button onMouseEnter={holdIndicator} onMouseLeave={releaseIndicator} data-testid="hoverArea">hover</button>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  mockUpdateSetting.mockClear();
  mockZoomLevel = ZOOM_DEFAULT;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ZoomProvider', () => {
  it('starts with the indicator hidden', () => {
    render(<ZoomProvider><Probe /></ZoomProvider>);
    expect(screen.getByTestId('visible').textContent).toBe('false');
  });

  it('shows the indicator and bumps the level on zoomIn', () => {
    render(<ZoomProvider><Probe /></ZoomProvider>);
    act(() => screen.getByText('in').click());
    expect(screen.getByTestId('visible').textContent).toBe('true');
    expect(screen.getByTestId('level').textContent).toBe('1.1');
  });

  it('stays visible for at least 1.5s after the last adjustment', () => {
    render(<ZoomProvider><Probe /></ZoomProvider>);
    act(() => screen.getByText('in').click());

    act(() => vi.advanceTimersByTime(ZOOM_INDICATOR_HOLD_MS - 100));
    expect(screen.getByTestId('visible').textContent).toBe('true');

    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByTestId('visible').textContent).toBe('false');
  });

  it('does not stack — repeated adjustments reuse the same indicator and just update the number', () => {
    render(<ZoomProvider><Probe /></ZoomProvider>);
    act(() => screen.getByText('in').click());
    act(() => vi.advanceTimersByTime(500));
    act(() => screen.getByText('in').click());

    // Only ever one indicator element in the DOM.
    expect(screen.getAllByTestId('visible')).toHaveLength(1);
    expect(screen.getByTestId('level').textContent).toBe('1.25');
  });

  it('restarts the hide timer on each adjustment instead of hiding on the first timer', () => {
    render(<ZoomProvider><Probe /></ZoomProvider>);
    act(() => screen.getByText('in').click());
    act(() => vi.advanceTimersByTime(1000));
    act(() => screen.getByText('in').click()); // resets the 1.5s clock

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('visible').textContent).toBe('true'); // would have hidden without the reset

    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByTestId('visible').textContent).toBe('false');
  });

  it('zooms out and resets correctly', () => {
    mockZoomLevel = 1.25;
    render(<ZoomProvider><Probe /></ZoomProvider>);
    act(() => screen.getByText('out').click());
    expect(screen.getByTestId('level').textContent).toBe('1.1');

    act(() => screen.getByText('reset').click());
    expect(screen.getByTestId('level').textContent).toBe('1');
  });

  it('holding the indicator (pointer hover) prevents it from hiding', () => {
    render(<ZoomProvider><Probe /></ZoomProvider>);
    act(() => screen.getByText('in').click());
    act(() => { fireEvent.mouseEnter(screen.getByTestId('hoverArea')); });

    act(() => vi.advanceTimersByTime(ZOOM_INDICATOR_HOLD_MS + 1000));
    expect(screen.getByTestId('visible').textContent).toBe('true');

    act(() => { fireEvent.mouseLeave(screen.getByTestId('hoverArea')); });
    act(() => vi.advanceTimersByTime(ZOOM_INDICATOR_HOLD_MS + 100));
    expect(screen.getByTestId('visible').textContent).toBe('false');
  });

  it('debounces the persisted save instead of writing on every keystroke of a burst', () => {
    render(<ZoomProvider><Probe /></ZoomProvider>);
    act(() => screen.getByText('in').click());
    act(() => screen.getByText('in').click());
    act(() => screen.getByText('in').click());
    expect(mockUpdateSetting).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(250));
    expect(mockUpdateSetting).toHaveBeenCalledTimes(1);
    expect(mockUpdateSetting).toHaveBeenCalledWith(SettingKey.ZOOM_LEVEL, 1.5);
  });
});
