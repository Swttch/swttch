import { describe, it, expect, beforeEach } from 'vitest';
import { KillRing } from '../killRing';

describe('KillRing', () => {
  let ring: KillRing;
  const field = {};
  const other = {};

  beforeEach(() => {
    ring = new KillRing();
  });

  it('is empty before the first kill', () => {
    expect(ring.text()).toBe('');
  });

  it('holds the text of a kill', () => {
    ring.recordKill(field, 'hello', 0, 'hello\nworld', '\nworld');
    expect(ring.text()).toBe('hello');
  });

  it('appends a kill that continues the previous one', () => {
    ring.recordKill(field, 'hello', 0, 'hello\nworld', '\nworld');
    ring.recordKill(field, '\n', 0, '\nworld', 'world');
    ring.recordKill(field, 'world', 0, 'world', '');
    expect(ring.text()).toBe('hello\nworld');
  });

  it('starts over when the text changed in between', () => {
    ring.recordKill(field, 'hello', 0, 'hello\nworld', '\nworld');
    ring.recordKill(field, '\n', 0, 'x\nworld', 'xworld');
    expect(ring.text()).toBe('\n');
  });

  it('starts over when the caret moved in between', () => {
    ring.recordKill(field, 'b', 1, 'ab', 'a');
    ring.recordKill(field, 'a', 0, 'a', '');
    expect(ring.text()).toBe('a');
  });

  it('starts over in another field', () => {
    ring.recordKill(field, 'one', 0, 'one', '');
    ring.recordKill(other, 'two', 0, '', '');
    expect(ring.text()).toBe('two');
  });

  it('starts over after breakSequence', () => {
    ring.recordKill(field, 'hello', 0, 'hello\nworld', '\nworld');
    ring.breakSequence();
    ring.recordKill(field, '\n', 0, '\nworld', 'world');
    expect(ring.text()).toBe('\n');
  });

  it('keeps the text after breakSequence, which only ends the run', () => {
    ring.recordKill(field, 'hello', 0, 'hello', '');
    ring.breakSequence();
    expect(ring.text()).toBe('hello');
  });

  it('forgets everything on clear', () => {
    ring.recordKill(field, 'hello', 0, 'hello', '');
    ring.clear();
    expect(ring.text()).toBe('');
  });
});
