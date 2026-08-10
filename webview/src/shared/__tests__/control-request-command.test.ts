import { describe, it, expect } from 'vitest';
import {
  CONTROL_REQUEST_COMMANDS,
  buildControlRequestPayload,
  matchControlRequestCommand,
} from '../control-request-command';

describe('matchControlRequestCommand', () => {
  it('matches a bare command', () => {
    const matched = matchControlRequestCommand('/reload-plugins');
    expect(matched?.command.subtype).toBe('reload_plugins');
    expect(matched?.args).toBe('');
  });

  it('matches a command with arguments and keeps them', () => {
    const matched = matchControlRequestCommand('/btw what does this flag do?');
    expect(matched?.command.subtype).toBe('side_question');
    expect(matched?.args).toBe('what does this flag do?');
  });

  it('matches a command with flag-style arguments', () => {
    const matched = matchControlRequestCommand('/reload-plugins --force');
    expect(matched?.command.subtype).toBe('reload_plugins');
    expect(matched?.args).toBe('--force');
  });

  // The CLI treats `/btwX` as a different word; so must we, or we would swallow
  // a prompt the user meant to send.
  it('does not match a longer word sharing the prefix', () => {
    expect(matchControlRequestCommand('/btwX')).toBeNull();
    expect(matchControlRequestCommand('/reload-pluginsX')).toBeNull();
  });

  it('does not match unrelated input', () => {
    expect(matchControlRequestCommand('reload-plugins')).toBeNull();
    expect(matchControlRequestCommand('tell me about /btw')).toBeNull();
    expect(matchControlRequestCommand('')).toBeNull();
  });

  // These two are listed and run by the CLI for us already, and each has its own
  // presentation here (`/context` a usage card, `/usage` the account modal).
  // Routing them through control_request would replace working features.
  it('leaves the commands the CLI already gives us alone', () => {
    expect(matchControlRequestCommand('/context')).toBeNull();
    expect(matchControlRequestCommand('/usage')).toBeNull();
  });
});

describe('buildControlRequestPayload', () => {
  const reloadPlugins = CONTROL_REQUEST_COMMANDS.find((c) => c.name === 'reload-plugins')!;
  const btw = CONTROL_REQUEST_COMMANDS.find((c) => c.name === 'btw')!;

  it('carries the subtype', () => {
    expect(buildControlRequestPayload(reloadPlugins, '')).toEqual({ subtype: 'reload_plugins' });
  });

  it('puts arguments in the field the command names', () => {
    expect(buildControlRequestPayload(btw, 'why?')).toEqual({
      subtype: 'side_question',
      question: 'why?',
    });
  });

  it('omits the argument field when there are no arguments', () => {
    expect(buildControlRequestPayload(btw, '')).toEqual({ subtype: 'side_question' });
  });

  // reload-plugins takes `--force` as a flag, not a value, so nothing should be
  // invented for it.
  it('drops arguments for commands with no argument field', () => {
    expect(buildControlRequestPayload(reloadPlugins, '--force')).toEqual({
      subtype: 'reload_plugins',
    });
  });
});
