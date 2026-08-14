import { describe, it, expect } from 'vitest';
import { anchorAt, composeDictation, wasEditedExternally } from '../composeDictation';

describe('anchorAt', () => {
  it('splits the value at the caret', () => {
    expect(anchorAt('hello world', 5)).toMatchObject({ prefix: 'hello', suffix: ' world' });
  });

  it('clamps a caret past the end', () => {
    expect(anchorAt('hi', 99)).toMatchObject({ prefix: 'hi', suffix: '' });
  });

  it('clamps a negative caret', () => {
    expect(anchorAt('hi', -3)).toMatchObject({ prefix: '', suffix: 'hi' });
  });
});

describe('composeDictation', () => {
  const empty = anchorAt('', 0);

  it('puts the first phrase into an empty box', () => {
    expect(composeDictation(empty, 'hello', true)).toMatchObject({ value: 'hello', caret: 5 });
  });

  it('adds a space after existing text that lacks one', () => {
    const r = composeDictation(anchorAt('hello', 5), 'world', true);
    expect(r?.value).toBe('hello world');
  });

  it('does not double a space the user already typed', () => {
    const r = composeDictation(anchorAt('hello ', 6), 'world', true);
    expect(r?.value).toBe('hello world');
  });

  it('inserts at the caret rather than appending', () => {
    // Caret sits between "hello " and "world".
    const r = composeDictation(anchorAt('hello world', 6), 'brave', true);
    expect(r?.value).toBe('hello brave world');
  });

  it('spaces the suffix side too', () => {
    const r = composeDictation(anchorAt('ab', 1), 'x', true);
    expect(r?.value).toBe('a x b');
  });

  it('marks interim text with its bounds', () => {
    const r = composeDictation(anchorAt('hello', 5), 'world', false);
    expect(r?.interim).toEqual({ start: 6, end: 11 });
    expect(r?.value.slice(6, 11)).toBe('world');
  });

  it('leaves final text unmarked, so it renders like typed text', () => {
    expect(composeDictation(empty, 'hello', true)?.interim).toBeNull();
  });

  it('replaces the previous interim rather than stacking it', () => {
    // The recognizer sends a growing phrase; each update starts from the same
    // anchor, so the box shows one run, not three.
    const anchor = anchorAt('note:', 5);
    expect(composeDictation(anchor, '안녕', false)?.value).toBe('note: 안녕');
    expect(composeDictation(anchor, '안녕 하', false)?.value).toBe('note: 안녕 하');
    expect(composeDictation(anchor, '안녕 하이', false)?.value).toBe('note: 안녕 하이');
  });

  it('puts the caret at the end of the dictated run, not the value', () => {
    const r = composeDictation(anchorAt('a b', 1), 'x', false);
    expect(r?.caret).toBe(r?.interim?.end);
    expect(r?.value.slice(0, r!.caret)).toBe('a x');
  });

  it('trims the recognizer\'s own padding', () => {
    expect(composeDictation(empty, '  hello  ', true)?.value).toBe('hello');
  });

  it('returns null for an empty phrase, so nothing is written', () => {
    expect(composeDictation(empty, '   ', true)).toBeNull();
    expect(composeDictation(empty, '', false)).toBeNull();
  });
});

describe('wasEditedExternally', () => {
  it('is false while only we are writing', () => {
    const anchor = { prefix: 'a', suffix: '', lastSetValue: 'a hello' };
    expect(wasEditedExternally(anchor, 'a hello')).toBe(false);
  });

  it('is true once the user types into the box themselves', () => {
    const anchor = { prefix: 'a', suffix: '', lastSetValue: 'a hello' };
    expect(wasEditedExternally(anchor, 'a hello!')).toBe(true);
  });
});
