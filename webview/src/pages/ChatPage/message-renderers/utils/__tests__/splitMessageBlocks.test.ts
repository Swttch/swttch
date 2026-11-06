import { describe, it, expect } from 'vitest';
import { splitMessageBlocks } from '../splitMessageBlocks';

describe('splitMessageBlocks', () => {
  it('leaves a message with no block syntax as one text block', () => {
    expect(splitMessageBlocks('hello\nworld')).toEqual([{ kind: 'text', text: 'hello\nworld' }]);
  });

  it('returns nothing for nothing', () => {
    expect(splitMessageBlocks('')).toEqual([]);
  });

  it('cuts a fenced code block out of the surrounding text', () => {
    const text = 'before\n```ts\nconst a = 1;\n  const b = 2;\n```\nafter';
    expect(splitMessageBlocks(text)).toEqual([
      { kind: 'text', text: 'before' },
      { kind: 'code', language: 'ts', code: 'const a = 1;\n  const b = 2;' },
      { kind: 'text', text: 'after' },
    ]);
  });

  it('takes a fence with no language and keeps blank lines inside it', () => {
    expect(splitMessageBlocks('```\na\n\nb\n```')).toEqual([
      { kind: 'code', language: '', code: 'a\n\nb' },
    ]);
  });

  it('does not let a quote marker or inline-code backticks inside a fence end it', () => {
    expect(splitMessageBlocks('```\n> not a quote\n`x`\n```')).toEqual([
      { kind: 'code', language: '', code: '> not a quote\n`x`' },
    ]);
  });

  it('leaves an unclosed fence as text', () => {
    expect(splitMessageBlocks('a\n```\nb')).toEqual([{ kind: 'text', text: 'a\n```\nb' }]);
  });

  it('does not treat three backticks in the middle of a line as a fence', () => {
    expect(splitMessageBlocks('use ```x``` here')).toEqual([{ kind: 'text', text: 'use ```x``` here' }]);
  });

  it('gathers consecutive quote lines into one quote without the markers', () => {
    expect(splitMessageBlocks('> one\n>two\n>   three\nplain')).toEqual([
      { kind: 'quote', text: 'one\ntwo\n  three' },
      { kind: 'text', text: 'plain' },
    ]);
  });

  it('keeps an empty quote line inside the quote', () => {
    expect(splitMessageBlocks('> a\n>\n> b')).toEqual([{ kind: 'quote', text: 'a\n\nb' }]);
  });

  it('keeps the order of text, code and quote', () => {
    expect(splitMessageBlocks('x\n> q\n```\nc\n```\ny')).toEqual([
      { kind: 'text', text: 'x' },
      { kind: 'quote', text: 'q' },
      { kind: 'code', language: '', code: 'c' },
      { kind: 'text', text: 'y' },
    ]);
  });
});
