import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { LoadedMessageDto } from '@/types';
// The registry first: it is the entry the app reaches the renderers through, and entering from them instead
// walks the module cycle the other way round.
import '../message-renderers/ToolRenderers';
import { TurnWrapUp } from '../TurnWrapUp';

const wrapUp = {
  message: {
    content: [
      {
        type: 'tool_use',
        name: 'mcp__ccd_turn__wrap_up',
        input: { recap: 'Done.', ask: 'Commit it?', actions: [{ label: 'Commit' }, { label: 'Not yet' }] },
      },
    ],
  },
} as unknown as LoadedMessageDto;

const send = (text: string) => ({ type: 'user', uuid: 'u2', message: { role: 'user', content: text } }) as unknown as LoadedMessageDto;

describe('TurnWrapUp', () => {
  it('draws the closing box of a turn that ended with a wrap-up, with the answers while none has come', () => {
    render(<TurnWrapUp body={[wrapUp]} next={null} />);
    expect(screen.getByText('Commit it?')).toBeInTheDocument();
    expect(screen.getByText('Commit')).toBeInTheDocument();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
  });

  it('leaves the reply that answered it, and no other answer, once the next send is one of them', () => {
    render(<TurnWrapUp body={[wrapUp]} next={send('Commit')} />);
    expect(screen.getAllByText('Commit')).toHaveLength(1);
    expect(screen.queryByText('Not yet')).not.toBeInTheDocument();
  });

  it('draws nothing for a turn without one', () => {
    const { container } = render(<TurnWrapUp body={[send('hi')]} next={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
