import {describe, it, expect, afterEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {CollapsibleBox} from '../_common';

/**
 * jsdom reports scrollHeight as 0 by default, so we stub it to simulate content
 * that overflows (or not) and exercise the collapse/expand branch.
 */
function stubScrollHeight(value: number) {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get() {
            return value;
        },
    });
}

afterEach(() => {
    delete (HTMLElement.prototype as {scrollHeight?: number}).scrollHeight;
});

describe('CollapsibleBox', () => {
    it('always renders its children', () => {
        stubScrollHeight(10);
        render(<CollapsibleBox>hello content</CollapsibleBox>);
        expect(screen.getByText('hello content')).toBeInTheDocument();
    });

    it('does not collapse when content fits within collapsedMaxHeight', () => {
        stubScrollHeight(40);
        render(<CollapsibleBox collapsedMaxHeight={60}>short</CollapsibleBox>);
        const box = screen.getByText('short');
        expect(box).not.toHaveClass('cursor-pointer');
        expect(box).not.toHaveClass('max-h-[3.75rem]');
    });

    it('collapses and shows a fade mask when content overflows', () => {
        stubScrollHeight(500);
        render(<CollapsibleBox collapsedMaxHeight={60}>tall content</CollapsibleBox>);
        const box = screen.getByText('tall content');
        expect(box).toHaveClass('cursor-pointer');
        expect(box).toHaveClass('max-h-[3.75rem]');
        expect(box).toHaveClass('overflow-hidden');
    });

    it('expands on click when overflowing, removing the height clamp', () => {
        stubScrollHeight(500);
        render(<CollapsibleBox collapsedMaxHeight={60}>tall content</CollapsibleBox>);
        const box = screen.getByText('tall content');
        expect(box).toHaveClass('max-h-[3.75rem]');
        fireEvent.click(box);
        expect(box).not.toHaveClass('max-h-[3.75rem]');
        fireEvent.click(box);
        expect(box).toHaveClass('max-h-[3.75rem]');
    });

    it('uses the 200px preset clamp when collapsedMaxHeight is 200', () => {
        stubScrollHeight(500);
        render(<CollapsibleBox collapsedMaxHeight={200}>long list</CollapsibleBox>);
        const box = screen.getByText('long list');
        expect(box).toHaveClass('max-h-[12.5rem]');
    });

    it('merges a custom className', () => {
        stubScrollHeight(10);
        render(<CollapsibleBox className="flex-1 whitespace-pre">content</CollapsibleBox>);
        const box = screen.getByText('content');
        expect(box).toHaveClass('flex-1');
        expect(box).toHaveClass('whitespace-pre');
    });
});
