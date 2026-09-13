import { describe, it, expect } from 'vitest';
import { parsePromptVariables, fillPromptVariables } from '../promptVariables';

describe('parsePromptVariables', () => {
  it('finds nothing in a prompt without placeholders', () => {
    expect(parsePromptVariables('머지했어 확인하고 로컬 정리해')).toEqual([]);
  });

  it('returns names in first-appearance order', () => {
    expect(parsePromptVariables('review {{file}} for {{focus}}')).toEqual(['file', 'focus']);
  });

  it('asks for a repeated name only once', () => {
    expect(parsePromptVariables('{{x}} and {{x}} again')).toEqual(['x']);
  });

  it('trims the name, so the spaced and unspaced forms are one variable', () => {
    expect(parsePromptVariables('{{ focus }} and {{focus}}')).toEqual(['focus']);
  });

  it('leaves JSON braces alone', () => {
    expect(parsePromptVariables('fix {"a": 1} in the config')).toEqual([]);
  });

  it('does not treat an unclosed opener as a placeholder', () => {
    expect(parsePromptVariables('this {{ never closes')).toEqual([]);
  });

  it('does not treat an empty or whitespace-only name as a placeholder', () => {
    expect(parsePromptVariables('{{}} and {{   }}')).toEqual([]);
  });
});

describe('fillPromptVariables', () => {
  it('returns the content unchanged when there is nothing to fill', () => {
    expect(fillPromptVariables('no variables here', {})).toBe('no variables here');
  });

  it('replaces every occurrence of the same name', () => {
    expect(fillPromptVariables('{{x}} then {{x}}', { x: 'A' })).toBe('A then A');
  });

  it('replaces the spaced form too', () => {
    expect(fillPromptVariables('{{ focus }}', { focus: 'races' })).toBe('races');
  });

  it('leaves a placeholder written as-is when no value was given', () => {
    expect(fillPromptVariables('{{a}} {{b}}', { a: 'A' })).toBe('A {{b}}');
  });

  it('accepts an empty string as an answer and substitutes it', () => {
    expect(fillPromptVariables('start{{a}}end', { a: '' })).toBe('startend');
  });

  it('does not re-fill a value that itself looks like a placeholder', () => {
    expect(fillPromptVariables('{{a}}', { a: '{{b}}', b: 'NO' })).toBe('{{b}}');
  });

  it('leaves JSON braces alone', () => {
    expect(fillPromptVariables('fix {"a": 1}', { a: 'X' })).toBe('fix {"a": 1}');
  });
});
