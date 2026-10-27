import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TextView } from '../TextView';

describe('TextView', () => {
  it('numbers the lines, keeps a blank line, and does not add one for the final newline', () => {
    const { container } = render(<TextView text={'a,b\r\n\r\n1,2\n'} />);
    const rows = [...container.querySelectorAll('tr')].map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent));
    expect(rows).toEqual([['1', 'a,b'], ['2', ' '], ['3', '1,2']]);
  });
});
