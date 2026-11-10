import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionManager } from '../connection-manager';
import { handleSessionControl, handleSessionControlRequest } from '../session-control-route';
import { renameSessionThroughCli } from '../../core/features/cli-rename';

vi.mock('../../core/claude', () => ({
  Claude: { killTree: vi.fn() },
}));

vi.mock('../../core/features/cli-rename', () => ({
  normalizeSessionName: (title: string) => title.replace(/\s+/g, ' ').trim(),
  renameSessionThroughCli: vi.fn(async () => 'request_to_live_cli'),
}));

// A session whose CLI this backend holds: what the route writes to its stdin is the whole effect.
function holdSession(cm: ConnectionManager, sessionId: string) {
  const written: string[] = [];
  const session = { process: { stdin: { writable: true, write: (text: string) => { written.push(text); return true; } } } };
  vi.spyOn(cm, 'getSession').mockImplementation(((id: string) => (id === sessionId ? session : undefined)) as never);
  return written;
}

const body = (o: unknown) => JSON.stringify(o);
const lines = (written: string[]) => written.flatMap((w) => w.split('\n').filter(Boolean)).map((l) => JSON.parse(l));

// The session-management MCP reaches a session another program holds through this route: the program
// that started the CLI is the only one that can write to its stdin.
describe('handleSessionControlRequest', () => {
  let cm: ConnectionManager;
  beforeEach(() => { cm = new ConnectionManager(); });

  it('rejects a body that is not JSON, or that names no session or no action', () => {
    expect(handleSessionControlRequest(cm, 'nope').status).toBe(400);
    expect(handleSessionControlRequest(cm, body({ action: 'interrupt' })).status).toBe(400);
    expect(handleSessionControlRequest(cm, body({ sessionId: 's1' })).status).toBe(400);
  });

  it('rejects an action it does not know', () => {
    holdSession(cm, 's1');
    expect(handleSessionControlRequest(cm, body({ sessionId: 's1', action: 'format_disk' })).status).toBe(400);
  });

  it('answers 404 for a session this backend holds no process for', () => {
    holdSession(cm, 's1');
    const result = handleSessionControlRequest(cm, body({ sessionId: 'other', action: 'interrupt' }));
    expect(result.status).toBe(404);
  });

  it('interrupt writes an interrupt control request to the CLI', () => {
    const written = holdSession(cm, 's1');
    const result = handleSessionControlRequest(cm, body({ sessionId: 's1', action: 'interrupt' }));
    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(lines(written)[0].request.subtype).toBe('interrupt');
  });

  it('send_message writes the text to the CLI as a user message', () => {
    const written = holdSession(cm, 's1');
    const result = handleSessionControlRequest(cm, body({ sessionId: 's1', action: 'send_message', text: 'hello there' }));
    expect(result.status).toBe(200);
    const sent = lines(written)[0];
    expect(sent.type).toBe('user');
    expect(JSON.stringify(sent)).toContain('hello there');
  });

  // The CLI does not echo what it is handed, so without this the screens showing the session see
  // Claude start answering a message they never saw arrive.
  it('send_message shows the message to the screens that have the session open', () => {
    holdSession(cm, 's1');
    const shown = vi.spyOn(cm, 'broadcastToSession').mockImplementation(() => undefined as never);
    handleSessionControlRequest(cm, body({ sessionId: 's1', action: 'send_message', text: 'hello there' }));
    expect(shown).toHaveBeenCalledWith('s1', 'USER_MESSAGE_BROADCAST', { content: 'hello there', sessionId: 's1' });
  });

  it('send_message that the CLI did not take is not shown as if it had arrived', () => {
    const session = { process: { stdin: { writable: false, write: () => false } } };
    vi.spyOn(cm, 'getSession').mockImplementation((() => session) as never);
    const shown = vi.spyOn(cm, 'broadcastToSession').mockImplementation(() => undefined as never);
    const result = handleSessionControlRequest(cm, body({ sessionId: 's1', action: 'send_message', text: 'hello there' }));
    expect(result.status).toBe(409);
    expect(shown).not.toHaveBeenCalled();
  });

  it('send_message without text is a 400', () => {
    holdSession(cm, 's1');
    expect(handleSessionControlRequest(cm, body({ sessionId: 's1', action: 'send_message' })).status).toBe(400);
  });

  it('set_model writes a set_model control request', () => {
    const written = holdSession(cm, 's1');
    const result = handleSessionControlRequest(cm, body({ sessionId: 's1', action: 'set_model', model: 'sonnet' }));
    expect(result.status).toBe(200);
    expect(lines(written)[0].request).toMatchObject({ subtype: 'set_model', model: 'sonnet' });
  });

  it('set_permission_mode takes the CLI\'s own mode names and writes a control request', () => {
    const written = holdSession(cm, 's1');
    const result = handleSessionControlRequest(cm, body({ sessionId: 's1', action: 'set_permission_mode', mode: 'acceptEdits' }));
    expect(result.status).toBe(200);
    expect(lines(written)[0].request).toMatchObject({ subtype: 'set_permission_mode', mode: 'acceptEdits' });
    expect(handleSessionControlRequest(cm, body({ sessionId: 's1', action: 'set_permission_mode', mode: 'yolo' })).status).toBe(400);
  });
});

// The session-management MCP renames a session this backend holds by asking this backend, so the name is
// recorded by the CLI that runs the session, the same way a rename made in this app is.
describe('handleSessionControl: rename', () => {
  let cm: ConnectionManager;
  const rename = vi.mocked(renameSessionThroughCli);
  beforeEach(() => {
    cm = new ConnectionManager();
    rename.mockReset();
    rename.mockResolvedValue('request_to_live_cli' as never);
  });

  function hold(sessionId: string) {
    const session = { process: { stdin: { writable: true, write: () => true } }, workingDir: '/work/project' };
    vi.spyOn(cm, 'getSession').mockImplementation(((id: string) => (id === sessionId ? session : undefined)) as never);
  }

  it('renames through the same path this app renames a session with, in the folder the session runs in', async () => {
    hold('s1');
    const result = await handleSessionControl(cm, body({ sessionId: 's1', action: 'rename', title: '  Billing\nrefactor ' }));
    expect(result).toEqual({ status: 200, body: { ok: true, delivery: 'request_to_live_cli' } });
    expect(rename).toHaveBeenCalledWith(cm, 's1', 'Billing refactor', '/work/project');
  });

  it('refuses a rename with no name, and one for a session this backend does not hold', async () => {
    hold('s1');
    expect((await handleSessionControl(cm, body({ sessionId: 's1', action: 'rename' }))).status).toBe(400);
    expect((await handleSessionControl(cm, body({ sessionId: 's1', action: 'rename', title: '   ' }))).status).toBe(400);
    expect((await handleSessionControl(cm, body({ sessionId: 'other', action: 'rename', title: 'Name' }))).status).toBe(404);
    expect(rename).not.toHaveBeenCalled();
  });

  it('answers with the reason when the CLI did not take the name', async () => {
    hold('s1');
    rename.mockRejectedValue(new Error('claude /rename timed out'));
    const result = await handleSessionControl(cm, body({ sessionId: 's1', action: 'rename', title: 'Name' }));
    expect(result.status).toBe(409);
    expect(result.body.error).toBe('claude /rename timed out');
  });

  it('leaves every other action to the part that answers at once', async () => {
    const session = { process: { stdin: { writable: true, write: () => true } } };
    vi.spyOn(cm, 'getSession').mockImplementation((() => session) as never);
    expect((await handleSessionControl(cm, body({ sessionId: 's1', action: 'interrupt' }))).status).toBe(200);
    expect((await handleSessionControl(cm, 'nope')).status).toBe(400);
    expect((await handleSessionControl(cm, body({ sessionId: 's1', action: 'format_disk' }))).status).toBe(400);
    expect(handleSessionControlRequest(cm, body({ sessionId: 's1', action: 'rename', title: 'x' })).status).toBe(400);
  });
});
