import { describe, it, expect, vi } from 'vitest';
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

describe('UserMessageRenderer — empty bubble guard (issue #232)', () => {
  it('renders nothing when the content is only a system-reminder', () => {
    const { container } = render(
      <UserMessageRenderer
        message={userMessage('<system-reminder>The user named this session "x".</system-reminder>')}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the content is an empty block array', () => {
    const { container } = render(<UserMessageRenderer message={userMessage([])} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the content is an empty string', () => {
    const { container } = render(<UserMessageRenderer message={userMessage('   ')} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when an ide_opened_file tag leaves no text behind', () => {
    // The tag is lifted into a context pill; on its own it leaves empty text.
    // parseUserContent only recognises the tag in its documented sentence form.
    const { container } = render(
      <UserMessageRenderer
        message={userMessage('<ide_opened_file>The user opened the file /tmp/a.ts in the IDE.</ide_opened_file>')}
      />,
    );
    // A context pill is real content, so the entry still renders — what must not
    // happen is an empty box with no pill.
    if (container.innerHTML !== '') {
      expect(container.textContent).toContain('a.ts');
    }
  });

  it('still renders a bubble when there is text', () => {
    const { container } = render(<UserMessageRenderer message={userMessage('hello')} />);
    expect(renderedBox(container)).not.toBeNull();
    expect(container.textContent).toContain('hello');
  });

  it('keeps a tool_result entry visible so unmerged tool output is not lost', () => {
    // mergeToolResults normally folds this into the tool card above. When it
    // cannot (the tool_use is on a not-yet-loaded page) the entry must survive,
    // or the tool's output disappears silently.
    const { container } = render(
      <UserMessageRenderer
        message={userMessage([{ type: 'tool_result', tool_use_id: 'call_1', content: 'output' }])}
      />,
    );
    expect(container.innerHTML).not.toBe('');
  });
});
