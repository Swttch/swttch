import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {EnterWorktreeRenderer} from '../EnterWorktreeRenderer';
import {ExitWorktreeRenderer} from '../ExitWorktreeRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';

function makeToolUse(name: string, input: Record<string, unknown>): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name,
        input,
    });
}

// `name` creates a worktree, `path` enters one that already exists, and neither
// means the runtime picks a name — three different actions behind one tool.
describe('EnterWorktreeRenderer', () => {
    it('names the worktree it creates', () => {
        render(<EnterWorktreeRenderer toolUse={makeToolUse('EnterWorktree', {name: 'fix-401'})} />);
        expect(screen.getByText(/fix-401/)).toBeInTheDocument();
    });

    it('distinguishes entering an existing worktree by path', () => {
        render(<EnterWorktreeRenderer toolUse={makeToolUse('EnterWorktree', {path: '/repo/.claude/worktrees/wt'})} />);
        expect(screen.getByText(/existing/i)).toBeInTheDocument();
        expect(screen.getByText(/\/repo\/\.claude\/worktrees\/wt/)).toBeInTheDocument();
    });

    it('says the name was generated when neither field is given', () => {
        render(<EnterWorktreeRenderer toolUse={makeToolUse('EnterWorktree', {})} />);
        expect(screen.getByText(/auto-named/i)).toBeInTheDocument();
    });
});

describe('ExitWorktreeRenderer', () => {
    it('reports keeping the worktree', () => {
        render(<ExitWorktreeRenderer toolUse={makeToolUse('ExitWorktree', {action: 'keep'})} />);
        expect(screen.getByText(/keep/i)).toBeInTheDocument();
    });

    it('reports removing the worktree', () => {
        render(<ExitWorktreeRenderer toolUse={makeToolUse('ExitWorktree', {action: 'remove'})} />);
        expect(screen.getByText(/remove/i)).toBeInTheDocument();
    });

    // Discarding is the destructive half of a remove — uncommitted work is gone.
    // It is the one thing a reader scanning the log has to be able to catch.
    it('flags discarded changes', () => {
        render(<ExitWorktreeRenderer toolUse={makeToolUse('ExitWorktree', {
            action: 'remove',
            discard_changes: true,
        })} />);

        expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
    });

    it('does not flag discarded changes on a plain remove', () => {
        render(<ExitWorktreeRenderer toolUse={makeToolUse('ExitWorktree', {action: 'remove'})} />);
        expect(screen.queryByText(/discard changes/i)).not.toBeInTheDocument();
    });
});
