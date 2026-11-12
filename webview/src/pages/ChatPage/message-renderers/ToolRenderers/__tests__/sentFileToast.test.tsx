import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import type {ReactNode} from 'react';
import {SAVED_TOAST_MS, showSavedToast} from '../sentFileToast';

const {success, dismiss, error, revealFile} = vi.hoisted(() => ({
    success: vi.fn(), dismiss: vi.fn(), error: vi.fn(), revealFile: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-hot-toast', () => ({default: {success, dismiss, error}}));
vi.mock('@/adapters', () => ({getAdapter: () => ({revealFile})}));

beforeEach(() => {
    success.mockReset();
    dismiss.mockReset();
    error.mockReset();
    revealFile.mockClear();
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

    it('names the file and shows where it went on a button, instead of printing the whole path', () => {
        showSavedToast('Saved: t.csv', '/Users/me/Documents/t.csv');
        render(<>{drawn()}</>);
        expect(screen.getByText('Saved: t.csv')).toBeInTheDocument();
        expect(screen.queryByText(/Documents/)).toBeNull();
        fireEvent.click(screen.getByRole('button', {name: 'Open folder'}));
        expect(revealFile).toHaveBeenCalledWith('/Users/me/Documents/t.csv');
        expect(dismiss).toHaveBeenCalledWith('t1');
    });

    it('draws no such button when it is not known where the file went', () => {
        showSavedToast('Downloaded t.csv');
        render(<>{drawn()}</>);
        expect(screen.queryByRole('button', {name: 'Open folder'})).toBeNull();
        expect(screen.getByRole('button', {name: 'Dismiss'})).toBeInTheDocument();
    });
});
