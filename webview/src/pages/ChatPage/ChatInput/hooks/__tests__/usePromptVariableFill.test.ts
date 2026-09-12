import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePromptVariableFill } from '../usePromptVariableFill';

describe('usePromptVariableFill', () => {
  it('inserts a prompt with no placeholders without asking anything', () => {
    const { result } = renderHook(() => usePromptVariableFill());
    const onFilled = vi.fn();

    act(() => result.current.requestFill('머지했어 확인해', onFilled));

    expect(onFilled).toHaveBeenCalledWith('머지했어 확인해');
    expect(result.current.pending).toBeNull();
  });

  it('holds a prompt with placeholders until it is answered', () => {
    const { result } = renderHook(() => usePromptVariableFill());
    const onFilled = vi.fn();

    act(() => result.current.requestFill('review {{file}} for {{focus}}', onFilled));

    expect(onFilled).not.toHaveBeenCalled();
    expect(result.current.pending).toEqual({
      content: 'review {{file}} for {{focus}}',
      names: ['file', 'focus'],
    });
  });

  it('inserts the filled text on submit', () => {
    const { result } = renderHook(() => usePromptVariableFill());
    const onFilled = vi.fn();
    act(() => result.current.requestFill('review {{file}}', onFilled));

    act(() => result.current.submit({ file: 'auth.ts' }));

    expect(onFilled).toHaveBeenCalledWith('review auth.ts');
    expect(result.current.pending).toBeNull();
  });

  it('inserts nothing when cancelled', () => {
    const { result } = renderHook(() => usePromptVariableFill());
    const onFilled = vi.fn();
    act(() => result.current.requestFill('review {{file}}', onFilled));

    act(() => result.current.cancel());

    expect(onFilled).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });

  // A held Enter auto-repeats, and the second keydown used to land on the next
  // screen. Here it would insert the same prompt twice.
  it('inserts once even when submit fires twice', () => {
    const { result } = renderHook(() => usePromptVariableFill());
    const onFilled = vi.fn();
    act(() => result.current.requestFill('review {{file}}', onFilled));

    act(() => {
      result.current.submit({ file: 'auth.ts' });
      result.current.submit({ file: 'auth.ts' });
    });

    expect(onFilled).toHaveBeenCalledTimes(1);
  });

  it('does nothing when submit arrives with nothing pending', () => {
    const { result } = renderHook(() => usePromptVariableFill());
    expect(() => act(() => result.current.submit({ a: 'b' }))).not.toThrow();
    expect(result.current.pending).toBeNull();
  });

  it('routes a second prompt to its own callback', () => {
    const { result } = renderHook(() => usePromptVariableFill());
    const first = vi.fn();
    const second = vi.fn();

    act(() => result.current.requestFill('one {{a}}', first));
    act(() => result.current.cancel());
    act(() => result.current.requestFill('two {{b}}', second));
    act(() => result.current.submit({ b: 'B' }));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('two B');
  });
});
