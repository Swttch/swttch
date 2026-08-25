import { describe, it, expect } from 'vitest';
import { caretBoundaryMoveFor } from '../caretBoundaryKey';
import { CaretBoundary, CaretDirection } from '@/utils/domSelection';

/**
 * Cmd+Arrow moves the caret to the edge of the line under off-screen rendering,
 * where Chromium performs no such move of its own (the composer is left holding
 * a keystroke with its modifiers intact and nothing to do it).
 *
 * What is pinned here is which keys the composer claims and what it asks for.
 * The pair that matters most is Cmd (claimed) against Option (not): taking
 * Option would swap Chromium's working word-wise movement for our own.
 */

function press(key: string, mods: Partial<Record<'metaKey' | 'altKey' | 'ctrlKey' | 'shiftKey', boolean>> = {}) {
  return caretBoundaryMoveFor({
    key,
    metaKey: mods.metaKey ?? false,
    altKey: mods.altKey ?? false,
    ctrlKey: mods.ctrlKey ?? false,
    shiftKey: mods.shiftKey ?? false,
  });
}

describe('caretBoundaryMoveFor', () => {
  it('sends Cmd+Left and Cmd+Right to the line edges', () => {
    expect(press('ArrowLeft', { metaKey: true })).toEqual({
      direction: CaretDirection.Backward,
      boundary: CaretBoundary.Line,
      extend: false,
    });
    expect(press('ArrowRight', { metaKey: true })).toEqual({
      direction: CaretDirection.Forward,
      boundary: CaretBoundary.Line,
      extend: false,
    });
  });

  it('sends Cmd+Up and Cmd+Down to the ends of the text', () => {
    expect(press('ArrowUp', { metaKey: true })?.boundary).toBe(CaretBoundary.Document);
    expect(press('ArrowDown', { metaKey: true })?.boundary).toBe(CaretBoundary.Document);
  });

  it('extends the selection when Shift is held', () => {
    // Cmd+Shift+Arrow is broken under OSR in the same way and for the same
    // reason as Cmd+Arrow, so it is claimed here too.
    expect(press('ArrowLeft', { metaKey: true, shiftKey: true })?.extend).toBe(true);
    expect(press('ArrowLeft', { metaKey: true })?.extend).toBe(false);
  });

  it('leaves Option+Arrow alone', () => {
    // Word-wise movement is Chromium's own and survives OSR. Claiming it would
    // mean reimplementing something that already works.
    expect(press('ArrowLeft', { altKey: true })).toBeNull();
    expect(press('ArrowLeft', { metaKey: true, altKey: true })).toBeNull();
  });

  it('leaves bare arrows and Ctrl+Arrow alone', () => {
    expect(press('ArrowLeft')).toBeNull();
    expect(press('ArrowRight')).toBeNull();
    // Ctrl+Arrow is Mission Control on macOS.
    expect(press('ArrowLeft', { ctrlKey: true })).toBeNull();
  });

  it('ignores keys that are not arrows', () => {
    expect(press('a', { metaKey: true })).toBeNull();
    expect(press('Enter', { metaKey: true })).toBeNull();
  });
});
