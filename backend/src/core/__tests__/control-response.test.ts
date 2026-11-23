import { describe, it, expect } from 'vitest';
import { USER_DECLINED_PREFIX } from '../../shared';
import { buildControlResponse } from '../control-response';

describe('buildControlResponse', () => {
  it('allows with the input the person gave, and no rules unless there are some', () => {
    expect(buildControlResponse('r1', { approved: true, updatedInput: { a: 1 } })).toEqual({
      subtype: 'success',
      request_id: 'r1',
      response: { behavior: 'allow', updatedInput: { a: 1 } },
    });
    expect((buildControlResponse('r1', { approved: true, updatedPermissions: [] }).response as any)).toEqual({ behavior: 'allow', updatedInput: {} });
  });

  it('carries the rules to install on an approval', () => {
    const rules = [{ type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' }] as never;
    expect((buildControlResponse('r1', { approved: true, updatedPermissions: rules }).response as any).updatedPermissions).toEqual(rules);
  });

  it('denies with the declined marker, and never attaches rules to a denial', () => {
    const response = buildControlResponse('r1', { approved: false, reason: 'not now', updatedPermissions: [{}] as never }).response as any;
    expect(response.behavior).toBe('deny');
    expect(response.message.startsWith(USER_DECLINED_PREFIX)).toBe(true);
    expect(response.message).toContain('not now');
    expect(response.updatedPermissions).toBeUndefined();
  });
});
