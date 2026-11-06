import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ToolUseBlockDto, ContentBlockType } from '@/dto';
import type { LoadedMessageDto } from '@/types';
// The registry first: it is the entry the app reaches these renderers through, and entering from the renderers
// instead walks the module cycle the other way round.
import { ToolRendererMap } from '../../..';
import { applyPlanCall, planAfterCall, type PlanItem } from '../planState';
import { UpdatePlanRenderer, WrapUpRenderer, WrapUpBox, CcdTurnRenderers, findWrapUpInput, wrapUpAnswers } from '../index';

function makeToolUse(name: string, input: Record<string, unknown>, id = 'tool_1'): ToolUseBlockDto {
  return Object.assign(new ToolUseBlockDto(), { type: ContentBlockType.ToolUse, id, name, input });
}

function transcriptOf(...calls: Array<{ id: string; input: Record<string, unknown> }>): LoadedMessageDto[] {
  return calls.map(
    (call) =>
      ({
        message: { content: [{ type: 'tool_use', id: call.id, name: 'mcp__ccd_turn__update_plan', input: call.input }] },
      }) as unknown as LoadedMessageDto,
  );
}

const statuses = (plan: PlanItem[]) => plan.map((item) => item.status);

describe('applyPlanCall', () => {
  const base = applyPlanCall([], {
    items: [
      { content: 'a', status: 'in_progress' },
      { content: 'b', status: 'pending' },
      { content: 'c', status: 'pending' },
    ],
  });

  it('takes the whole list from `items`, reading an unknown status as pending', () => {
    expect(base.map((item) => item.content)).toEqual(['a', 'b', 'c']);
    expect(applyPlanCall([], { items: [{ content: 'x', status: 'weird' }, { content: ' ' }, null] })).toEqual([
      { content: 'x', status: 'pending' },
    ]);
  });

  it('draws no more than twelve steps', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ content: `s${index}`, status: 'pending' }));
    expect(applyPlanCall([], { items: many })).toHaveLength(12);
  });

  it('`advance` ticks the step in progress and starts the next one', () => {
    expect(statuses(applyPlanCall(base, { advance: true }))).toEqual(['completed', 'in_progress', 'pending']);
    expect(statuses(applyPlanCall(base, { advance: 'true' }))).toEqual(['completed', 'in_progress', 'pending']);
  });

  it('`done` and `start` use 1-based step numbers and ignore numbers out of range', () => {
    expect(statuses(applyPlanCall(base, { done: [1, 9], start: 3 }))).toEqual(['completed', 'pending', 'in_progress']);
    expect(statuses(applyPlanCall(base, { start: 0 }))).toEqual(['in_progress', 'pending', 'pending']);
  });

  it('`advance` with nothing left to start only ticks', () => {
    const last = applyPlanCall(base, { done: [1, 2], start: 3 });
    expect(statuses(applyPlanCall(last, { advance: true }))).toEqual(['completed', 'completed', 'completed']);
  });
});

describe('planAfterCall', () => {
  it('folds the calls before this one, then applies this one', () => {
    const messages = transcriptOf(
      { id: 'c1', input: { items: [{ content: 'a', status: 'in_progress' }, { content: 'b', status: 'pending' }] } },
      { id: 'c2', input: { advance: true } },
      { id: 'c3', input: { advance: true } },
    );
    const firstInput = (messages[0].message?.content as Array<{ input: Record<string, unknown> }>)[0].input;
    expect(statuses(planAfterCall(messages, 'c1', firstInput))).toEqual(['in_progress', 'pending']);
    expect(statuses(planAfterCall(messages, 'c2', { advance: true }))).toEqual(['completed', 'in_progress']);
    expect(statuses(planAfterCall(messages, 'c3', { advance: true }))).toEqual(['completed', 'completed']);
  });

  it('stands alone without a transcript', () => {
    expect(planAfterCall(undefined, 'x', { items: [{ content: 'a', status: 'completed' }] })).toEqual([
      { content: 'a', status: 'completed' },
    ]);
    expect(planAfterCall(undefined, 'x', { advance: true })).toEqual([]);
  });
});

describe('the ccd_turn renderers', () => {
  it('are what the registry hands out for the two tools', () => {
    expect(ToolRendererMap.get('mcp__ccd_turn__update_plan')).toBe(UpdatePlanRenderer);
    expect(ToolRendererMap.get('mcp__ccd_turn__wrap_up')).toBe(WrapUpRenderer);
    expect(CcdTurnRenderers.map(([name]) => name)).toEqual(['mcp__ccd_turn__update_plan', 'mcp__ccd_turn__wrap_up']);
  });

  it('draw a plan as a checklist, not as JSON', () => {
    render(
      <UpdatePlanRenderer
        toolUse={makeToolUse('mcp__ccd_turn__update_plan', {
          items: [
            { content: 'Read the file', status: 'completed' },
            { content: 'Write the card', status: 'in_progress' },
            { content: 'Run the tests', status: 'pending' },
          ],
          scope: 'first_task',
        })}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.getAttribute('data-status'))).toEqual(['completed', 'in_progress', 'pending']);
    expect(screen.getByText('Run the tests')).toBeInTheDocument();
    expect(screen.queryByText(/first_task/)).not.toBeInTheDocument();
  });

  it('draw the plan as a bare box, with no tool title over it', () => {
    const { container } = render(
      <UpdatePlanRenderer toolUse={makeToolUse('mcp__ccd_turn__update_plan', { items: [{ content: 'a', status: 'pending' }] })} />,
    );
    expect(container.textContent).toBe('a');
  });

  it('draw nothing for a wrap-up call itself: its box comes at the end of the turn', () => {
    const { container } = render(
      <WrapUpRenderer toolUse={makeToolUse('mcp__ccd_turn__wrap_up', { recap: 'The fix is in.', ask: 'Commit it?' })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('WrapUpBox', () => {
  const input = {
    recap: 'The fix is in.',
    ask: 'Commit it?',
    actions: [{ label: 'Commit' }, { action: 'create_pr' }],
    blocked: true,
  };

  it('shows the recap, the question and the answers offered, with no title', () => {
    const { container } = render(<WrapUpBox input={input} />);
    expect(screen.getByText('The fix is in.')).toBeInTheDocument();
    expect(screen.getByText('Commit it?')).toBeInTheDocument();
    expect(screen.getByText('Commit')).toBeInTheDocument();
    expect(screen.getByText('Create PR')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/ccd|wrap up|blocked/i);
  });

  it('keeps only the reply once the question has been answered with one of the answers', () => {
    render(<WrapUpBox input={input} reply=" Commit " />);
    expect(screen.getAllByText('Commit')).toHaveLength(1);
    expect(screen.queryByText('Create PR')).not.toBeInTheDocument();
  });

  it('shows no answer when the user answered in other words', () => {
    render(<WrapUpBox input={input} reply="not yet, first do Y" />);
    expect(screen.queryByText('Commit')).not.toBeInTheDocument();
    expect(screen.queryByText('Create PR')).not.toBeInTheDocument();
    expect(screen.getByText('Commit it?')).toBeInTheDocument();
  });

  it('sends an answer as the reply when it is pressed, then shows only that answer', () => {
    const onAnswer = vi.fn();
    render(<WrapUpBox input={input} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /create pr/i }));
    expect(onAnswer).toHaveBeenCalledWith('Create PR');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Create PR')).toBeInTheDocument();
    expect(screen.queryByText('Commit')).not.toBeInTheDocument();
  });

  it('names an app action in words, as the answer it sends', () => {
    expect(wrapUpAnswers([{ action: 'fix_ci' }, { action: 'new_session' }, { action: 'other_thing' }, { label: 'Yes' }])).toEqual([
      'Fix CI',
      'New session',
      'other thing',
      'Yes',
    ]);
  });

  it('draws the answers as buttons only when they can be pressed, and the first one carries the key hint', () => {
    const { rerender } = render(<WrapUpBox input={input} onAnswer={() => {}} />);
    const first = screen.getByRole('button', { name: /commit/i });
    expect(first.textContent).toMatch(/↵/);
    expect(screen.getByRole('button', { name: /create pr/i }).textContent).not.toMatch(/↵/);
    rerender(<WrapUpBox input={input} />);
    expect(screen.getByRole('button', { name: /commit/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /commit/i }).textContent).not.toMatch(/↵/);
  });

  it('takes the key hint off the first answer while the composer holds anything, and puts it back after', () => {
    const { rerender } = render(<WrapUpBox input={input} onAnswer={() => {}} composerEmpty={false} />);
    expect(screen.getByRole('button', { name: /commit/i }).textContent).not.toMatch(/↵/);
    rerender(<WrapUpBox input={input} onAnswer={() => {}} composerEmpty />);
    expect(screen.getByRole('button', { name: /commit/i }).textContent).toMatch(/↵/);
  });

  it('presses the first answer on Cmd+Enter or Ctrl+Enter while the composer is empty, and not otherwise', () => {
    const onAnswer = vi.fn();
    const { rerender } = render(<WrapUpBox input={input} onAnswer={onAnswer} composerEmpty={false} />);
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onAnswer).not.toHaveBeenCalled();

    rerender(<WrapUpBox input={input} onAnswer={onAnswer} composerEmpty />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith('Commit');
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('is nothing when there is nothing in it', () => {
    const { container } = render(<WrapUpBox input={{ blocked: true }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('findWrapUpInput', () => {
  const call = (name: string, input: Record<string, unknown>) => ({ message: { content: [{ type: 'tool_use', name, input }] } });

  it('takes the last wrap-up call of the turn, wherever its message sits', () => {
    expect(
      findWrapUpInput([
        call('mcp__ccd_turn__wrap_up', { recap: 'first' }),
        { message: { content: [{ type: 'text', text: 'closing message' }] } },
        call('mcp__ccd_turn__wrap_up', { recap: 'second' }),
        { message: { content: [{ type: 'text', text: 'closing message' }] } },
      ]),
    ).toEqual({ recap: 'second' });
  });

  it('is undefined for a turn that made none', () => {
    expect(findWrapUpInput([call('Bash', { command: 'ls' }), { message: { content: 'plain' } }])).toBeUndefined();
  });
});
