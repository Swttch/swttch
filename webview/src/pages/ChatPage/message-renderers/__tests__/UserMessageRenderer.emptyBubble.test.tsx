import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { LoadedMessageDto } from '../../../../types';
import { LoadedMessageType, toInstance } from '../../../../dto/common';

// The renderer reads the CLI config to localize a `/model` echo; no provider is
// mounted here, so stub it with an empty response.
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: null }),
}));

import { UserMessageRenderer } from '../UserMessageRenderer';

function userMessage(content: unknown, extra: Record<string, unknown> = {}): LoadedMessageDto {
  return toInstance(LoadedMessageDto, {
    type: LoadedMessageType.User,
    uuid: 'u-test',
    message: { role: 'user', content },
    ...extra,
  });
}

/** The empty bubble is `MessageBox` with nothing in it — border, no content. */
function renderedBox(container: HTMLElement): Element | null {
  return container.querySelector('.bg-surface-hover.border');
}

/**
 * Asserts the entry puts nothing on screen.
 *
 * Not `innerHTML === ''`: `IfVisible` keeps its wrapper mounted and collapses it
 * with `display: none`, so the subtree stays in the DOM on purpose. It has to —
 * the wrapper holds the `ref` the visibility check reads `textContent` from, and
 * dropping it would freeze the verdict at the first render, so an entry whose
 * content arrives later could never come back. The wrapper also carries the
 * `data-ccg-would-be-empty` trail that keeps "how often would this have been an
 * empty bubble?" answerable in production.
 *
 * What matters to the user is that nothing is painted, which is what this checks.
 */
function expectNothingVisible(container: HTMLElement): void {
  const wrapper = container.firstElementChild as HTMLElement | null;
  if (wrapper === null) return; // rendered literally nothing — also fine
  expect(container.children).toHaveLength(1);
  expect(wrapper.style.display).toBe('none');
}

describe('UserMessageRenderer — empty bubble guard (issue #232)', () => {
  it('renders nothing when the content is only a system-reminder', () => {
    const { container } = render(
      <UserMessageRenderer
        message={userMessage('<system-reminder>The user named this session "x".</system-reminder>')}
      />,
    );
    expectNothingVisible(container);
  });

  it('renders nothing when the content is an empty block array', () => {
    const { container } = render(<UserMessageRenderer message={userMessage([])} />);
    expectNothingVisible(container);
  });

  it('renders nothing when the content is an empty string', () => {
    const { container } = render(<UserMessageRenderer message={userMessage('   ')} />);
    expectNothingVisible(container);
  });

  it('renders nothing when an ide_opened_file tag leaves no text behind', () => {
    // The tag is lifted into a context pill; on its own it leaves empty text.
    // parseUserContent only recognises the tag in its documented sentence form.
    const { container } = render(
      <UserMessageRenderer
        message={userMessage('<ide_opened_file>The user opened the file /tmp/a.ts in the IDE.</ide_opened_file>')}
      />,
    );
    // A context pill is real content, so the entry may still render — what must
    // not happen is an empty box with no pill.
    const wrapper = container.firstElementChild as HTMLElement | null;
    if (wrapper && wrapper.style.display !== 'none') {
      expect(container.textContent).toContain('a.ts');
    }
  });

  it('still renders a bubble when there is text', () => {
    const { container } = render(<UserMessageRenderer message={userMessage('hello')} />);
    expect(renderedBox(container)).not.toBeNull();
    expect(container.textContent).toContain('hello');
  });

  // The v0.26.4 guard kept a tool_result visible but rendered
  // `parsedContent.text`, which is empty for one — so the "kept" entry was a bare
  // bordered pill and the output it was meant to protect never reached the
  // screen. The reporter hit this on a 110-minute / 258-turn session, where an
  // unpaired tool_result is far more likely.
  it('shows the actual output of an unmerged tool_result, not an empty pill', () => {
    const { container } = render(
      <UserMessageRenderer
        message={userMessage([
          { type: 'tool_result', tool_use_id: 'call_1', content: 'REAL OUTPUT' },
        ])}
      />,
    );
    expect(container.textContent).toContain('REAL OUTPUT');
  });

  it('shows output when the tool_result content is a text-block array', () => {
    // Task-style results arrive as blocks rather than a bare string.
    const { container } = render(
      <UserMessageRenderer
        message={userMessage([
          {
            type: 'tool_result',
            tool_use_id: 'call_1',
            content: [{ type: 'text', text: 'BLOCK OUTPUT' }],
          },
        ])}
      />,
    );
    expect(container.textContent).toContain('BLOCK OUTPUT');
  });

  it('renders nothing for a tool_result that carries no output at all', () => {
    // With no text to show, the entry protects nothing — an empty pill is the
    // very symptom of issue #232.
    const { container } = render(
      <UserMessageRenderer
        message={userMessage([{ type: 'tool_result', tool_use_id: 'call_1', content: '' }])}
      />,
    );
    expectNothingVisible(container);
  });
});

/**
 * The rule is about what a human sees, not about what a string contains.
 *
 * Guarding case by case did not hold: `''` was covered, then `<system-reminder>`,
 * then `tool_result` — and a zero-width space still drew a box, because
 * `String.trim()` does not consider one to be whitespace. Worse, the
 * `commandName` branch returned *above* the guard, so it was never checked at
 * all. Every new invisible character and every new branch was another leak.
 *
 * So the check moved to the single exit and asks about the rendered output. The
 * cases below are examples of that rule, not the rule itself.
 *
 * Escapes, not literals: these characters are invisible in an editor, so a
 * pasted one would be unreviewable — and a stray one breaks the parse outright.
 */
const INVISIBLE: Array<[string, string]> = [
  ['zero-width space', '​'],
  ['zero-width non-joiner', '‌'],
  ['zero-width joiner', '‍'],
  ['left-to-right mark', '‎'],
  ['right-to-left mark', '‏'],
  ['word joiner', '⁠'],
  ['soft hyphen', '­'],
  ['BOM / zero-width no-break', '﻿'],
  ['non-breaking space', ' '],
  ['ideographic space', '　'],
  ['hangul filler', 'ㅤ'],
  ['variation selector', '️'],
  ['bidi override', '‮'],
  ['ordinary whitespace', '   \n\t  '],
  ['a mix of several', '​ ­⁠﻿\n'],
];

describe('UserMessageRenderer — nothing visible means nothing rendered', () => {
  it.each(INVISIBLE)('renders nothing for plain text that is only a %s', (_name, ch) => {
    const { container } = render(<UserMessageRenderer message={userMessage(ch)} />);
    expectNothingVisible(container);
  });

  it.each(INVISIBLE)('renders nothing for a tool_result that is only a %s', (_name, ch) => {
    const { container } = render(
      <UserMessageRenderer
        message={userMessage([{ type: 'tool_result', tool_use_id: 'c1', content: ch }])}
      />,
    );
    expectNothingVisible(container);
  });

  it.each(INVISIBLE)('renders nothing for a command name that is only a %s', (_name, ch) => {
    // This branch used to return above the guard, so it was never checked.
    const { container } = render(
      <UserMessageRenderer message={userMessage(`<command-name>${ch}</command-name>`)} />,
    );
    expectNothingVisible(container);
  });

  it('still renders text that merely contains an invisible character', () => {
    // The rule drops what is invisible, not what is merely unusual.
    const { container } = render(<UserMessageRenderer message={userMessage('a​b')} />);
    expect(container.textContent).toContain('a');
    expect(container.textContent).toContain('b');
  });

  it('still renders a real command name', () => {
    const { container } = render(
      <UserMessageRenderer message={userMessage('<command-name>/clear</command-name>')} />,
    );
    expect(container.textContent).toContain('clear');
  });

  it('keeps an image-only message, which has no glyphs by nature', () => {
    const { container } = render(
      <UserMessageRenderer
        message={userMessage([
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBOR' } },
        ])}
      />,
    );
    // `not.toBe('')` would pass on the collapsed wrapper alone, so assert the
    // wrapper is actually shown — an image has no glyph, and `extra` is what
    // keeps it from being mistaken for an empty bubble.
    const wrapper = container.firstElementChild as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper!.style.display).not.toBe('none');
  });
});

/**
 * Hiding the bubble solves the symptom but erases the evidence: once the box is
 * gone, "this build is fixed" and "these conditions never arose" look identical
 * on screen. The trail is what tells them apart — it survives the fix, so a run
 * with `count > 0` and no visible box is proof the guard did the work, while
 * `count === 0` means the case simply did not come up.
 *
 * It is deliberately left on in production: a reporter's console is often the
 * only place the defect can be observed at all.
 */
describe('UserMessageRenderer — the hidden bubble leaves a trail', () => {
  function trail(): { count: number; ids: string[] } | undefined {
    return (window as unknown as { ccgEmptyBubbles?: { count: number; ids: string[] } })
      .ccgEmptyBubbles;
  }

  beforeEach(() => {
    delete (window as unknown as { ccgEmptyBubbles?: unknown }).ccgEmptyBubbles;
  });

  it('counts a bubble it hid, and records the tool_use_id it belonged to', () => {
    render(
      <UserMessageRenderer
        message={userMessage([{ type: 'tool_result', tool_use_id: 'toolu_abc', content: '' }])}
      />,
    );
    expect(trail()?.count).toBe(1);
    expect(trail()?.ids).toContain('toolu_abc');
  });

  it('marks the hidden element so it can be found in the DOM', () => {
    const { container } = render(
      <UserMessageRenderer
        message={userMessage([{ type: 'tool_result', tool_use_id: 'toolu_abc', content: '' }])}
      />,
    );
    const marked = container.querySelector('[data-ccg-would-be-empty="toolu_abc"]');
    expect(marked).not.toBeNull();
    expect((marked as HTMLElement).style.display).toBe('none');
  });

  it('does not count an entry that renders normally', () => {
    render(<UserMessageRenderer message={userMessage('hello')} />);
    expect(trail()?.count ?? 0).toBe(0);
  });

  it('counts one occurrence per bubble, not one per render', () => {
    // The visibility check runs in an effect on every render; a re-render must
    // not inflate the tally, or the number stops meaning "times this happened".
    const message = userMessage([{ type: 'tool_result', tool_use_id: 'toolu_abc', content: '' }]);
    const { rerender } = render(<UserMessageRenderer message={message} />);
    rerender(<UserMessageRenderer message={message} />);
    rerender(<UserMessageRenderer message={message} />);
    expect(trail()?.count).toBe(1);
  });

  it('accumulates across separate empty bubbles', () => {
    render(
      <UserMessageRenderer
        message={userMessage([{ type: 'tool_result', tool_use_id: 'toolu_1', content: '' }])}
      />,
    );
    render(
      <UserMessageRenderer
        message={userMessage([{ type: 'tool_result', tool_use_id: 'toolu_2', content: '' }])}
      />,
    );
    expect(trail()?.count).toBe(2);
    expect(trail()?.ids).toEqual(['toolu_1', 'toolu_2']);
  });
});
