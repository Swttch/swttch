import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptAwaitingInput } from '../TranscriptAwaitingInput';

// #673: the line shown while a turn runs and a permission card waits for the person.
describe('TranscriptAwaitingInput', () => {
  it('says an answer is needed, beside the amber waiting mark', () => {
    const { container } = render(<TranscriptAwaitingInput />);

    expect(screen.getByRole('status')).toHaveTextContent('Input needed');
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
