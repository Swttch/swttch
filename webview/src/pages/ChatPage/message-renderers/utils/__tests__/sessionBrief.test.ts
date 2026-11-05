import { describe, expect, it } from 'vitest';
import { parseSessionBrief } from '../sessionBrief';

const NOTES = "Shared notes folder for this group of sessions (outside the repo; read siblings' notes there, leave hand-over notes or large findings there instead of pasting them into messages): /tmp/notes";

describe('parseSessionBrief', () => {
  it('splits the background and the task', () => {
    expect(parseSessionBrief('Background (from the session that started this one):\nB line\n\nTask:\nT line')).toEqual({
      task: 'T line',
      context: 'B line',
    });
  });

  it('moves the shared notes folder paragraph from the end of the task to the context', () => {
    expect(parseSessionBrief(`Background (from the session that started this one):\nB\n\nTask:\nT1\n\nT2\n\n${NOTES}`)).toEqual({
      task: 'T1\n\nT2',
      context: `B\n\n${NOTES}`,
    });
  });

  it('keeps a paragraph that only looks like the notes folder one in the task', () => {
    const text = `Background (from the session that started this one):\nB\n\nTask:\nT\n\n${NOTES}\nand more`;
    expect(parseSessionBrief(text)).toEqual({ task: `T\n\n${NOTES}\nand more`, context: 'B' });
  });

  it('accepts the older form that opens with a task header', () => {
    expect(
      parseSessionBrief('Task (from the session that started this one):\nBackground (from the session that started this one):\nB\n\nTask:\nT'),
    ).toEqual({ task: 'T', context: 'B' });
  });

  it('leaves anything else as a plain message', () => {
    expect(parseSessionBrief('hello')).toBeNull();
    expect(parseSessionBrief('Background (from the session that started this one):\nB only')).toBeNull();
    expect(parseSessionBrief('Background (from the session that started this one):\nB\n\nTask:\n')).toBeNull();
    expect(parseSessionBrief('Background (from the session that started this one):\n\n\nTask:\nT')).toBeNull();
    expect(parseSessionBrief('note\nBackground (from the session that started this one):\nB\n\nTask:\nT')).toBeNull();
  });

  it('refuses a message with two "Task:" lines', () => {
    expect(parseSessionBrief('Background (from the session that started this one):\nB\n\nTask:\nT\n\nTask:\nU')).toBeNull();
  });
});
