import { describe, it, expect } from 'vitest';
import { parseAnsi } from '../ansi';

/** The escape byte every sequence below opens with, spelled out so the source
 *  never carries an invisible control character. */
const ESC = '\u001b';

describe('parseAnsi', () => {
  it('leaves text with no escapes as one plain segment', () => {
    expect(parseAnsi('plain log line')).toEqual([{ text: 'plain log line', className: '' }]);
  });

  it('colours a run and stops at the reset', () => {
    const segments = parseAnsi(`${ESC}[31mred${ESC}[0m after`);

    expect(segments.map((s) => s.text)).toEqual(['red', ' after']);
    expect(segments[0].className).toContain('text-red-400');
    expect(segments[1].className).toBe('');
  });

  // This is the exact shape a real `dist` log arrived in, and what it used to
  // render as: `[2mdist/ [22m [36mmwasm-CG6Dc4jp.js [39m`.
  it('strips the codes vite wraps its build output in', () => {
    const line = `${ESC}[2mdist/${ESC}[22m ${ESC}[36mmwasm.js${ESC}[39m ${ESC}[1m${ESC}[33m622.34 kB${ESC}[39m${ESC}[22m`;
    const segments = parseAnsi(line);

    expect(segments.map((s) => s.text).join('')).toBe('dist/ mwasm.js 622.34 kB');
    expect(segments.map((s) => s.text).join('')).not.toContain('[');
  });

  it('combines bold with a colour, and 22 clears only the bold', () => {
    const [bold, plainColour] = parseAnsi(`${ESC}[1m${ESC}[32mok${ESC}[22mstill green`);

    expect(bold.className).toContain('font-bold');
    expect(bold.className).toContain('text-emerald-400');
    expect(plainColour.className).not.toContain('font-bold');
    expect(plainColour.className).toContain('text-emerald-400');
  });

  it('renders a background colour', () => {
    expect(parseAnsi(`${ESC}[44mblue bg${ESC}[49m`)[0].className).toContain('bg-blue-900');
  });

  // Cursor moves and erases mean nothing in a pane that only appends, so they
  // are dropped rather than printed as text.
  it('drops escapes that are not styling', () => {
    expect(parseAnsi(`${ESC}[2K${ESC}[1Gclean line`)).toEqual([{ text: 'clean line', className: '' }]);
    expect(parseAnsi(`${ESC}]0;window title${ESC}\\kept`)).toEqual([{ text: 'kept', className: '' }]);
  });

  // 256-colour and truecolour carry their arguments in following codes; reading
  // those as styles of their own would paint the text at random.
  it('skips over extended colour arguments', () => {
    const segments = parseAnsi(`${ESC}[38;5;196mx${ESC}[0m`);
    expect(segments[0].text).toBe('x');
    expect(segments[0].className).not.toContain('font-bold');

    const truecolour = parseAnsi(`${ESC}[38;2;255;0;0my${ESC}[0m`);
    expect(truecolour[0].text).toBe('y');
  });

  // A progress bar rewrites one line over and over with \r. Without collapsing,
  // a single gradle line arrives as hundreds of stacked copies.
  it('keeps only the last write of a line rewritten with carriage returns', () => {
    expect(parseAnsi('10%\r50%\r100%\ndone')).toEqual([{ text: '100%\ndone', className: '' }]);
  });

  it('treats a bare ESC[m as a reset', () => {
    const segments = parseAnsi(`${ESC}[31mred${ESC}[mplain`);
    expect(segments[1].className).toBe('');
  });
});
