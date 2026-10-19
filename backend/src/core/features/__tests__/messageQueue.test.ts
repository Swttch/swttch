/**
 * The backend-owned queue behind the "queue" composer follow-up setting.
 *
 * Mirrors `afterTurn.test.ts`'s style: this module holds data only, so these
 * tests exercise enqueue/dequeue/remove/clear directly, without a CLI process
 * or a WebSocket connection anywhere in the picture.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueMessage,
  removeQueuedMessage,
  getQueuedMessages,
  dequeueNextMessage,
  clearQueuedMessages,
  clearAllQueuedMessages,
  mergeQueuedMessages,
  moveQueuedMessage,
  takeQueuedMessage,
  restoreQueuedMessage,
  type QueuedMessageEntry,
} from '../messageQueue';

beforeEach(() => clearAllQueuedMessages());

function entry(id: string, content: string): QueuedMessageEntry {
  return { id, content, queuedAt: 0 };
}

describe('holding a message in the explicit queue', () => {
  it('lists what was queued, oldest first', () => {
    enqueueMessage('sess-1', entry('a', 'first'));
    enqueueMessage('sess-1', entry('b', 'second'));

    expect(getQueuedMessages('sess-1').map(e => e.content)).toEqual(['first', 'second']);
  });

  it('lists nothing for a session that queued nothing', () => {
    expect(getQueuedMessages('sess-quiet')).toEqual([]);
  });

  it('keeps sessions apart', () => {
    enqueueMessage('sess-1', entry('a', 'for one'));
    enqueueMessage('sess-2', entry('b', 'for two'));

    expect(getQueuedMessages('sess-1').map(e => e.content)).toEqual(['for one']);
    expect(getQueuedMessages('sess-2').map(e => e.content)).toEqual(['for two']);
  });
});

describe('cancelling a queued message', () => {
  it('removes the matching entry and leaves the rest', () => {
    enqueueMessage('sess-1', entry('a', 'keep'));
    enqueueMessage('sess-1', entry('b', 'cancel me'));
    enqueueMessage('sess-1', entry('c', 'keep too'));

    const removed = removeQueuedMessage('sess-1', 'b');

    expect(removed).toBe(true);
    expect(getQueuedMessages('sess-1').map(e => e.id)).toEqual(['a', 'c']);
  });

  it('reports false for an id that is not queued', () => {
    enqueueMessage('sess-1', entry('a', 'keep'));

    expect(removeQueuedMessage('sess-1', 'missing')).toBe(false);
    expect(getQueuedMessages('sess-1').map(e => e.id)).toEqual(['a']);
  });

  it('reports false for a session with no queue at all', () => {
    expect(removeQueuedMessage('sess-empty', 'a')).toBe(false);
  });
});

describe('releasing the next queued message at the end of a turn', () => {
  it('hands back the oldest entry and leaves the rest queued', () => {
    enqueueMessage('sess-1', entry('a', 'first'));
    enqueueMessage('sess-1', entry('b', 'second'));

    const released = dequeueNextMessage('sess-1');

    expect(released?.content).toBe('first');
    expect(getQueuedMessages('sess-1').map(e => e.content)).toEqual(['second']);
  });

  it('hands back undefined for a session with nothing queued', () => {
    expect(dequeueNextMessage('sess-quiet')).toBeUndefined();
  });

  it('hands each entry back once', () => {
    enqueueMessage('sess-1', entry('a', 'only'));
    dequeueNextMessage('sess-1');

    expect(dequeueNextMessage('sess-1')).toBeUndefined();
    expect(getQueuedMessages('sess-1')).toEqual([]);
  });
});

describe('dropping a dead session\'s queue', () => {
  it('clears everything held for it', () => {
    enqueueMessage('sess-1', entry('a', 'notice'));

    clearQueuedMessages('sess-1');

    expect(getQueuedMessages('sess-1')).toEqual([]);
    expect(dequeueNextMessage('sess-1')).toBeUndefined();
  });

  it('leaves other sessions untouched', () => {
    enqueueMessage('sess-1', entry('a', 'for one'));
    enqueueMessage('sess-2', entry('b', 'for two'));

    clearQueuedMessages('sess-1');

    expect(getQueuedMessages('sess-2').map(e => e.content)).toEqual(['for two']);
  });
});

function seed(...ids: string[]) {
  ids.forEach((id, i) => enqueueMessage('s', { id, content: id.toUpperCase(), queuedAt: i }));
}
const ids = () => getQueuedMessages('s').map(e => e.id);

describe('mergeQueuedMessages', () => {
  beforeEach(() => clearAllQueuedMessages());

  it('adds the dragged message after the target, in the target place, keeping its id and queuedAt', () => {
    seed('a', 'b', 'c');
    expect(mergeQueuedMessages('s', 'c', 'a')).toBe(true);
    const [merged, rest] = getQueuedMessages('s');
    expect(merged).toMatchObject({ id: 'a', content: 'A\n\nC', queuedAt: 0 });
    expect(rest.id).toBe('b');
    expect(ids()).toEqual(['a', 'b']);
  });

  it('works when the dragged message sits above the target', () => {
    seed('a', 'b', 'c');
    expect(mergeQueuedMessages('s', 'a', 'c')).toBe(true);
    expect(ids()).toEqual(['b', 'c']);
    expect(getQueuedMessages('s')[1]).toMatchObject({ id: 'c', content: 'C\n\nA', queuedAt: 2 });
  });

  it('puts the target attachments first, then the dragged message ones', () => {
    const img = { type: 'image' as const, fileName: 'x.png', mimeType: 'image/png', base64: '' };
    const file = { type: 'file' as const, fileName: 'y.ts', absolutePath: '/y.ts' };
    enqueueMessage('s', { id: 'a', content: 'A', queuedAt: 0, attachments: [img] });
    enqueueMessage('s', { id: 'b', content: 'B', queuedAt: 1, attachments: [file] });
    mergeQueuedMessages('s', 'a', 'b');
    expect(getQueuedMessages('s')[0].attachments).toEqual([file, img]);
  });

  it('leaves attachments undefined when neither message had any', () => {
    seed('a', 'b');
    mergeQueuedMessages('s', 'b', 'a');
    expect(getQueuedMessages('s')[0].attachments).toBeUndefined();
  });

  it('refuses a message merged onto itself and unknown ids', () => {
    seed('a', 'b');
    expect(mergeQueuedMessages('s', 'a', 'a')).toBe(false);
    expect(mergeQueuedMessages('s', 'zz', 'a')).toBe(false);
    expect(mergeQueuedMessages('s', 'a', 'zz')).toBe(false);
    expect(mergeQueuedMessages('none', 'a', 'b')).toBe(false);
    expect(ids()).toEqual(['a', 'b']);
    expect(getQueuedMessages('s').map(m => m.content)).toEqual(['A', 'B']);
  });
});

describe('moveQueuedMessage', () => {
  beforeEach(() => clearAllQueuedMessages());

  it('moves an entry down and up', () => {
    seed('a', 'b', 'c');
    expect(moveQueuedMessage('s', 'a', 1)).toBe(true);
    expect(ids()).toEqual(['b', 'a', 'c']);
    expect(moveQueuedMessage('s', 'c', 0)).toBe(true);
    expect(ids()).toEqual(['c', 'b', 'a']);
  });

  it('clamps the target index', () => {
    seed('a', 'b', 'c');
    moveQueuedMessage('s', 'a', 99);
    expect(ids()).toEqual(['b', 'c', 'a']);
    moveQueuedMessage('s', 'a', -5);
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('returns false for an unknown id', () => {
    seed('a');
    expect(moveQueuedMessage('s', 'zz', 0)).toBe(false);
  });
});

describe('takeQueuedMessage / restoreQueuedMessage', () => {
  beforeEach(() => clearAllQueuedMessages());

  it('takes a message out with its index, and restore puts it back there', () => {
    seed('a', 'b', 'c');
    const taken = takeQueuedMessage('s', 'b');
    expect(taken?.message.id).toBe('b');
    expect(taken?.index).toBe(1);
    expect(ids()).toEqual(['a', 'c']);
    restoreQueuedMessage('s', taken!.message, taken!.index);
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('forgets the session once its last message is taken, and restore recreates it', () => {
    seed('a');
    const taken = takeQueuedMessage('s', 'a');
    expect(getQueuedMessages('s')).toEqual([]);
    restoreQueuedMessage('s', taken!.message, 5);
    expect(ids()).toEqual(['a']);
  });

  it('returns undefined for an unknown id', () => {
    expect(takeQueuedMessage('s', 'zz')).toBeUndefined();
  });
});
