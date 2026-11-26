import { describe, expect, it } from 'vitest';
import type { LoadedMessageDto } from '../../../types';
import { mergeToolResults } from '../mergeToolResults';
import { withoutSplitResults } from '../withoutSplitResults';

const entry = (fields: Record<string, unknown>) => fields as unknown as LoadedMessageDto;
const result = (uuid: string, id: string) =>
  entry({ uuid, type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'out' }] } });
const call = (uuid: string, id: string) =>
  entry({ uuid, type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: {} }] } });
const text = (uuid: string) => entry({ uuid, type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } });
const note = (uuid: string) => entry({ uuid, type: 'system' });
const ids = (messages: LoadedMessageDto[]) => messages.map((m) => m.uuid);

describe('withoutSplitResults', () => {
  // #747. A page that begins between a call and its result.
  const held = [result('r1', '1'), note('n'), result('r2', '2'), text('a'), result('late', '9'), call('c', '3'), result('r3', '3')];
  const drawn = mergeToolResults(held);

  it('leaves out the results a page opens with while their calls are on the older page', () => {
    expect(ids(withoutSplitResults(drawn, held, null, true))).toEqual(['n', 'a', 'late', 'c']);
  });

  it('shows them when there is nothing older to bring their calls', () => {
    expect(withoutSplitResults(drawn, held, null, false)).toBe(drawn);
  });

  it('shows them folded into their calls once the older page is there', () => {
    const all = [call('c1', '1'), call('c2', '2'), ...held];
    expect(ids(withoutSplitResults(mergeToolResults(all), all, null, true))).toEqual(['c1', 'c2', 'n', 'a', 'late', 'c']);
  });

  it('does the same for what the stretch after the gap opens with', () => {
    const two = [text('old'), result('r4', '4'), result('r5', '5'), text('new')];
    const shown = withoutSplitResults(mergeToolResults(two), two, { afterUuid: 'old', beforeUuid: 'r4' }, false);
    expect(ids(shown)).toEqual(['old', 'new']);
  });
});
