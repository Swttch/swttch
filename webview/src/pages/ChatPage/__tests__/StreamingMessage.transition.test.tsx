import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StreamingMessage } from '../StreamingMessage';
import type { LoadedMessageDto } from '../../../types';

const messageAt = (iso: string) => ({ uuid: 'u1', timestamp: iso } as unknown as LoadedMessageDto);

describe('StreamingMessage — transitions', () => {
  it('slides up a reply that arrives whole just now', () => {
    const { container } = render(
      <StreamingMessage plain content="hello" isStreaming={false} message={messageAt(new Date().toISOString())} />,
    );
    expect(container.querySelector('.reply-slide-up')).not.toBeNull();
  });

  it('draws a reply from history (old time) without sliding', () => {
    const { container } = render(
      <StreamingMessage plain content="hello" isStreaming={false} message={messageAt('2020-01-01T00:00:00Z')} />,
    );
    expect(container.querySelector('.reply-slide-up')).toBeNull();
  });

  it('does not slide a reply that is streaming; its words fade in instead', () => {
    const { container } = render(
      <StreamingMessage plain content="hello big world" isStreaming={true} message={messageAt(new Date().toISOString())} />,
    );
    expect(container.querySelector('.reply-slide-up')).toBeNull();
    expect(container.querySelectorAll('.streaming-words .stream-word').length).toBe(3);
  });

  it('keeps plain text, with no per-word spans, once the reply is done', () => {
    const { container } = render(<StreamingMessage plain content="hello big world" isStreaming={false} />);
    expect(container.querySelectorAll('.stream-word').length).toBe(0);
  });
});
