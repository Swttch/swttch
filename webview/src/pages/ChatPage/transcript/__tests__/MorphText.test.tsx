import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MorphText } from '../MorphText';

describe('MorphText', () => {
  it('draws the first sentence without any animation', () => {
    const { container } = render(<MorphText id="a">Running a command</MorphText>);

    expect(container.querySelector('.morph-in')).toBeNull();
    expect(container.querySelector('.morph-out')).toBeNull();
    expect(container.textContent).toBe('Running a command');
  });

  it('keeps the old sentence over the new one until its fade ends, then takes it away', () => {
    const { container, rerender } = render(<MorphText id="a">Running a command</MorphText>);
    rerender(<MorphText id="b">Read 3 files</MorphText>);

    const leaving = container.querySelector('.morph-out');
    expect(leaving?.textContent).toBe('Running a command');
    expect(container.querySelector('.morph-in')?.textContent).toBe('Read 3 files');

    fireEvent.animationEnd(leaving as Element);
    expect(container.querySelector('.morph-out')).toBeNull();
    expect(container.textContent).toBe('Read 3 files');
  });

  it('does not treat a change of the children under the same id as a new sentence', () => {
    const { container, rerender } = render(<MorphText id="a">Ran 1 command</MorphText>);
    rerender(<MorphText id="a">Ran 2 commands</MorphText>);

    expect(container.querySelector('.morph-out')).toBeNull();
    expect(container.querySelector('.morph-in')).toBeNull();
    expect(container.textContent).toBe('Ran 2 commands');
  });
});
