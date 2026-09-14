import { describe, it, expect } from 'vitest';
import {
  findChipRange,
  caretAfterArrow,
  caretPushedOutOfChip,
  backspaceRange,
  deleteRange,
} from '../recipientChipCaret';

const TOKEN = '@@fix the proxy';
//            0123456789...
const VALUE = `${TOKEN} 안녕`;
const START = 0;
const END = TOKEN.length; // 15
const END_WITH_SPACE = END + 1; // 16

const range = findChipRange(VALUE, TOKEN)!;

/**
 * The chip stands for one address, so it behaves like one character: the caret
 * never rests inside it, one arrow press crosses it, and a delete takes all of
 * it. Half a chip addresses nothing and says nothing.
 */
describe('findChipRange', () => {
  it('finds the chip and the space that came with it', () => {
    expect(range).toEqual({ start: START, end: END, endWithSpace: END_WITH_SPACE });
  });

  it('stops at the chip when no space follows', () => {
    expect(findChipRange(TOKEN, TOKEN)).toEqual({
      start: 0,
      end: END,
      endWithSpace: END,
    });
  });

  it('finds a chip that is not at the start', () => {
    const found = findChipRange(`hey ${TOKEN} 안녕`, TOKEN)!;
    expect(found.start).toBe(4);
    expect(found.end).toBe(4 + END);
  });

  it('gives null once the chip is gone from the value', () => {
    expect(findChipRange('just words', TOKEN)).toBeNull();
    expect(findChipRange(VALUE, '')).toBeNull();
  });
});

describe('caretAfterArrow', () => {
  it('crosses the whole chip leftward in one press', () => {
    // From the far edge — the case the user asked for by name.
    expect(caretAfterArrow(range, END, 'ArrowLeft')).toBe(START);
    // And from anywhere the caret should never have been.
    expect(caretAfterArrow(range, 7, 'ArrowLeft')).toBe(START);
    expect(caretAfterArrow(range, START + 1, 'ArrowLeft')).toBe(START);
  });

  it('crosses the whole chip rightward in one press', () => {
    expect(caretAfterArrow(range, START, 'ArrowRight')).toBe(END);
    expect(caretAfterArrow(range, 7, 'ArrowRight')).toBe(END);
    expect(caretAfterArrow(range, END - 1, 'ArrowRight')).toBe(END);
  });

  it('leaves the arrows alone outside the chip', () => {
    // Left from before it, right from after it: ordinary text movement.
    expect(caretAfterArrow(range, START, 'ArrowLeft')).toBeNull();
    expect(caretAfterArrow(range, END, 'ArrowRight')).toBeNull();
    expect(caretAfterArrow(range, VALUE.length, 'ArrowLeft')).toBeNull();
    expect(caretAfterArrow(range, VALUE.length, 'ArrowRight')).toBeNull();
  });
});

describe('caretPushedOutOfChip', () => {
  it('pushes a caret dropped inside to the nearer edge', () => {
    expect(caretPushedOutOfChip(range, 2)).toBe(START);
    expect(caretPushedOutOfChip(range, END - 2)).toBe(END);
  });

  it('leaves a caret resting on either edge where it is', () => {
    // Otherwise the push would fight the arrow keys and trap the caret.
    expect(caretPushedOutOfChip(range, START)).toBeNull();
    expect(caretPushedOutOfChip(range, END)).toBeNull();
  });

  it('leaves a caret outside the chip alone', () => {
    expect(caretPushedOutOfChip(range, VALUE.length)).toBeNull();
    expect(caretPushedOutOfChip(findChipRange(`hey ${TOKEN}`, TOKEN)!, 2)).toBeNull();
  });
});

describe('backspaceRange', () => {
  it('takes the chip and its space from the trailing edge', () => {
    expect(backspaceRange(range, END)).toEqual([START, END_WITH_SPACE]);
    expect(backspaceRange(range, END_WITH_SPACE)).toEqual([START, END_WITH_SPACE]);
  });

  it('leaves ordinary deletion alone', () => {
    // Before the chip, and in the middle of the sentence after it.
    expect(backspaceRange(range, START)).toBeNull();
    expect(backspaceRange(range, VALUE.length)).toBeNull();
  });
});

describe('deleteRange', () => {
  it('takes the chip and its space from the leading edge', () => {
    expect(deleteRange(range, START)).toEqual([START, END_WITH_SPACE]);
  });

  it('leaves ordinary forward deletion alone', () => {
    expect(deleteRange(range, END)).toBeNull();
    expect(deleteRange(range, VALUE.length)).toBeNull();
  });
});
