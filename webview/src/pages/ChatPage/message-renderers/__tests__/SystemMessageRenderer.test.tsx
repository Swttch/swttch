import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SystemMessageRenderer } from '../SystemMessageRenderer';
import { LoadedMessageDto } from '../../../../types';
import { LoadedMessageType } from '../../../../dto/common';

function systemEntry(fields: Partial<LoadedMessageDto>): LoadedMessageDto {
  return Object.assign(new LoadedMessageDto(), { type: LoadedMessageType.System, uuid: 's1' }, fields);
}

/**
 * Live, `/rename` is answered by an assistant message. The transcript stores
 * that answer as a `system` entry of subtype `local_command`, and a reloaded
 * session used to hide it, so the reply the user saw vanished on refresh.
 */
describe('SystemMessageRenderer', () => {
  it('draws what a slash command printed, without the stdout tags', () => {
    render(
      <SystemMessageRenderer
        message={systemEntry({
          subtype: 'local_command',
          content: '<local-command-stdout>Session renamed to: My new name</local-command-stdout>',
        })}
      />,
    );

    expect(screen.getByText('Session renamed to: My new name')).toBeVisible();
  });

  it('keeps every other system entry hidden', () => {
    const { container } = render(
      <SystemMessageRenderer message={systemEntry({ subtype: 'init', content: 'session initialised' })} />,
    );

    expect(container.firstElementChild).toHaveClass('hidden');
  });

  it('draws nothing visible for a local command that printed nothing', () => {
    const { container } = render(
      <SystemMessageRenderer
        message={systemEntry({ subtype: 'local_command', content: '<local-command-stdout></local-command-stdout>' })}
      />,
    );

    expect(container.textContent).toBe('');
  });
});
