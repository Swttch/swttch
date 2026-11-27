import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { SessionSend } from '@/shared';
import { SendIndex } from '../SendIndex';

const loadAround = vi.fn(() => Promise.resolve());

vi.mock('@/contexts/ApiContext', () => ({ useApi: () => ({ sessions: { loadAround } }) }));
vi.mock('@/contexts/SessionContext', () => ({ useSessionContext: () => ({ currentSessionId: 'session' }) }));
vi.mock('@/contexts/WorkingDirContext', () => ({ useWorkingDir: () => ({ workingDirectory: '/project' }) }));

const SENDS: SessionSend[] = [
  { uuid: 'far', timestamp: null, preview: 'far away' },
  { uuid: 'near', timestamp: null, preview: 'close by' },
];

/** The send's section as the transcript draws it, once it is there to draw. */
function draw(uuid: string): HTMLElement {
  const section = document.createElement('div');
  section.setAttribute('data-send-section', uuid);
  const sentinel = document.createElement('div');
  sentinel.setAttribute('data-send-sentinel', '');
  sentinel.scrollIntoView = vi.fn();
  section.append(sentinel);
  document.body.append(section);
  return sentinel;
}

describe('SendIndex: a jump', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const rail = () => render(<SendIndex side="start" sections={[]} sessionSends={SENDS} />);
  const tick = (i: number) => document.querySelectorAll<HTMLElement>('[data-send-index-tick]')[i];

  it('goes to a send that had to be loaded once it is drawn', () => {
    const view = rail();
    fireEvent.click(tick(0));
    expect(loadAround).toHaveBeenCalledWith('session', 'far', '/project');

    const far = draw('far');
    view.rerender(<SendIndex side="start" sections={[]} sessionSends={SENDS} />);

    expect(far.scrollIntoView).toHaveBeenCalled();
  });

  // #708. The page of the first jump arrives after the reader has gone somewhere else.
  it('does not take the reader to a send they have since jumped away from', () => {
    const near = draw('near');
    const view = rail();
    fireEvent.click(tick(0));
    fireEvent.click(tick(1));
    expect(near.scrollIntoView).toHaveBeenCalled();

    const far = draw('far');
    view.rerender(<SendIndex side="start" sections={[]} sessionSends={SENDS} />);

    expect(far.scrollIntoView).not.toHaveBeenCalled();
  });
});
