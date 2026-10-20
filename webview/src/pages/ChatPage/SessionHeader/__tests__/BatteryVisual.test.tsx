import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BatteryVisual } from '../BatteryVisual';

describe('BatteryVisual', () => {
  it('shows the remaining percentage as given', () => {
    render(<BatteryVisual remaining={72} />);
    expect(screen.getByText('72%')).toBeTruthy();
  });

  // The CLI reports window usage as a fraction that passes 1 once the 5-hour cap is
  // exceeded (2.53 is 253%), so `100 - utilization` goes below zero.
  it('never shows a negative percentage when the window is used past its cap', () => {
    render(<BatteryVisual remaining={-153} />);
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.queryByText(/-/)).toBeNull();
  });

  it('never shows more than 100%', () => {
    render(<BatteryVisual remaining={130} />);
    expect(screen.getByText('100%')).toBeTruthy();
  });
});
