import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import type {ReactNode} from 'react';
import {SAVED_TOAST_MS, showSavedToast} from '../sentFileToast';

const {success, dismiss} = vi.hoisted(() => ({success: vi.fn(), dismiss: vi.fn()}));

vi.mock('react-hot-toast', () => ({default: {success, dismiss}}));

beforeEach(() => {
    success.mockReset();
    dismiss.mockReset();
});

/** What the toast draws, taken from the render function it hands to react-hot-toast. */
function drawn(): ReactNode {
    const [renderToast] = success.mock.calls[0] as [(instance: {id: string}) => ReactNode];
    return renderToast({id: 't1'});
}

describe('showSavedToast', () => {
    it('stays five seconds, long enough to read the folder it names', () => {
        showSavedToast('Saved: /Users/me/t.csv');
        expect(SAVED_TOAST_MS).toBe(5000);
        expect(success).toHaveBeenCalledWith(expect.any(Function), {duration: 5000});
    });

    it('says what it was told, and wraps a long path instead of running out of the toast', () => {
        showSavedToast('Saved: /Users/me/a/very/long/path/that/goes/on/t.csv');
        render(<>{drawn()}</>);
        const text = screen.getByText('Saved: /Users/me/a/very/long/path/that/goes/on/t.csv');
        expect(text.className).toContain('break-all');
    });

    it('can be put away by hand before the five seconds are up', () => {
        showSavedToast('Saved: /Users/me/t.csv');
        render(<>{drawn()}</>);
        fireEvent.click(screen.getByRole('button', {name: 'Dismiss'}));
        expect(dismiss).toHaveBeenCalledWith('t1');
    });
});
