import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionManager } from '../connection-manager';
import { handleSessionControlRequest } from '../session-control-route';

vi.mock('../../core/claude', () => ({
  Claude: { killTree: vi.fn() },
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
