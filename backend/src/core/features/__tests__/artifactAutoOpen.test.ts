import { describe, it, expect } from 'vitest';
import { ArtifactAutoOpener, isArtifactAutoOpenDisabled } from '../artifactAutoOpen';

const PAGE = 'https://claude.ai/artifact/abc123_XYZ-9';

function assistantEvent(blocks: Array<Record<string, unknown>>): Record<string, unknown> {
  return { type: 'assistant', message: { role: 'assistant', content: blocks }, session_id: 's' };
}

function userEvent(blocks: Array<Record<string, unknown>>): Record<string, unknown> {
  return { type: 'user', message: { role: 'user', content: blocks }, session_id: 's' };
}

function artifactCall(id: string, input: Record<string, unknown>, name = 'Artifact') {
  return assistantEvent([{ type: 'tool_use', id, name, input }]);
}

function result(id: string, content: unknown, isError?: boolean) {
  return userEvent([
    { type: 'tool_result', tool_use_id: id, content, ...(isError === undefined ? {} : { is_error: isError }) },
  ]);
}

describe('isArtifactAutoOpenDisabled', () => {
  it('is on when the variable is absent', () => {
    expect(isArtifactAutoOpenDisabled({})).toBe(false);
  });

  it.each(['0', 'false', 'no', 'off', 'FALSE', ' Off '])('is off for %j, the CLI\'s own off values', (value) => {
    expect(isArtifactAutoOpenDisabled({ CLAUDE_CODE_ARTIFACT_AUTO_OPEN: value })).toBe(true);
  });

  it.each(['1', 'true', 'yes', 'on', ''])('stays on for %j', (value) => {
    expect(isArtifactAutoOpenDisabled({ CLAUDE_CODE_ARTIFACT_AUTO_OPEN: value })).toBe(false);
  });
});

describe('ArtifactAutoOpener', () => {
  it('returns the address of a page that was just created', () => {
    const opener = new ArtifactAutoOpener();
    opener.recordPublishes(artifactCall('tu-1', { type_url: 'https://claude.ai/types/slides', title: 'Deck' }));
    expect(opener.collectUrlsToOpen(result('tu-1', `Created a new Artifact at ${PAGE} (version 1).`), {})).toEqual([PAGE]);
  });

  it('reads a result that arrives as a list of text blocks', () => {
    const opener = new ArtifactAutoOpener();
    opener.recordPublishes(artifactCall('tu-1', { file_path: '/tmp/page.html' }));
    const content = [{ type: 'text', text: `Published C:\\tmp\\page.html at ${PAGE} (Version 1, version id 1792776356-8ea1) Icon: "greeting".` }];
    expect(opener.collectUrlsToOpen(result('tu-1', content), {})).toEqual([PAGE]);
  });

  // Measured on CLI 2.1.309: the first and the second publish of one file both
  // answer "Published <file> at <address> (Version N, …)" and neither call has a `url`.
  it('opens the first publish of a file and not the second, which carries no url either', () => {
    const opener = new ArtifactAutoOpener();
    const file = 'C:\\tmp\\hello.html';
    opener.recordPublishes(artifactCall('tu-1', { file_path: file, icon: 'greeting', description: 'A tiny hello page.' }));
    expect(opener.collectUrlsToOpen(result('tu-1', `Published ${file} at ${PAGE} (Version 1, version id 1792776356-8ea1) Icon: "greeting".`), {})).toEqual([PAGE]);

    opener.recordPublishes(artifactCall('tu-2', { file_path: file, edits: [{ old_str: '<h1>Hello</h1>', new_str: '<h1>Hello again</h1>' }] }));
    expect(opener.collectUrlsToOpen(result('tu-2', `Published ${file} at ${PAGE} (Version 2, version id 1792776439-f4fa)`), {})).toEqual([]);
  });

  // What `/slides` gets back from CLI 2.1.309: the parenthesis holds a version id,
  // not a counter, and the call carries a type_url and an auto_open, no url.
  it('opens the page a /slides create reports, whose version is an id', () => {
    const opener = new ArtifactAutoOpener();
    opener.recordPublishes(artifactCall('tu-1', {
      type_url: 'https://claude.ai/artifact/8jTsAFQMFDb2oA8MsPJ2eL',
      title: 'ccg593 deck',
      auto_open: 'after_first_write',
    }));
    const text = `Created a new Artifact at ${PAGE} (version 1792777235-07a8) from the Artifact type https://claude.ai/artifact/8jTsAFQMFDb2oA8MsPJ2eL (release 1792775915-aac1). File names below are names chosen by the type's publisher.`;
    expect(opener.collectUrlsToOpen(result('tu-1', text), {})).toEqual([PAGE]);
  });

  it('does not open the page of an earlier attempt that already created it', () => {
    const opener = new ArtifactAutoOpener();
    opener.recordPublishes(artifactCall('tu-1', { type_url: 'https://claude.ai/artifact/8jTsAFQMFDb2oA8MsPJ2eL' }));
    const text = `An earlier attempt of this call already created the Artifact at ${PAGE} (version 1792777235-07a8) from https://claude.ai/artifact/8jTsAFQMFDb2oA8MsPJ2eL, so nothing new was created.`;
    expect(opener.collectUrlsToOpen(result('tu-1', text), {})).toEqual([]);
  });

  it('opens nothing when the result names no version, rather than a tab on every update', () => {
    const opener = new ArtifactAutoOpener();
    opener.recordPublishes(artifactCall('tu-1', { file_path: '/tmp/page.html' }));
    expect(opener.collectUrlsToOpen(result('tu-1', `Published /tmp/page.html at ${PAGE}`), {})).toEqual([]);
  });

  it('opens the code/artifact form of the address too', () => {
    const opener = new ArtifactAutoOpener();
    const page = 'https://claude.ai/code/artifact/uuid-1';
    opener.recordPublishes(artifactCall('tu-1', { action: 'publish', file_path: '/tmp/page.html' }));
    expect(opener.collectUrlsToOpen(result('tu-1', `Created a new Artifact at ${page} (version 1).`), {})).toEqual([page]);
  });

  it('does not open anything for an update, which names the page by url', () => {
    const opener = new ArtifactAutoOpener();
    opener.recordPublishes(artifactCall('tu-1', { url: PAGE, file_path: '/tmp/page.html' }));
    expect(opener.collectUrlsToOpen(result('tu-1', `Updated the Artifact at ${PAGE} (version 3).`), {})).toEqual([]);
  });

  it.each(['quickstart', 'list', 'read', 'open', 'delete'])('does not open anything for action %s', (action) => {
    const opener = new ArtifactAutoOpener();
    opener.recordPublishes(artifactCall('tu-1', { action, intent: 'slides' }));
    expect(opener.collectUrlsToOpen(result('tu-1', `see ${PAGE}`), {})).toEqual([]);
  });

  it('does not open anything for the other Artifact tools', () => {
    const opener = new ArtifactAutoOpener();
    opener.recordPublishes(artifactCall('tu-1', {}, 'ArtifactData'));
    opener.recordPublishes(artifactCall('tu-2', {}, 'ArtifactComments'));
    expect(opener.collectUrlsToOpen(userEvent([
      { type: 'tool_result', tool_use_id: 'tu-1', content: PAGE },
      { type: 'tool_result', tool_use_id: 'tu-2', content: PAGE },
    ]), {})).toEqual([]);
  });

  it('does not open anything when the call failed, and forgets the call', () => {
    const opener = new ArtifactAutoOpener();
    opener.recordPublishes(artifactCall('tu-1', { file_path: '/tmp/page.html' }));
    expect(opener.collectUrlsToOpen(result('tu-1', `failed near ${PAGE}`, true), {})).toEqual([]);
    expect(opener.collectUrlsToOpen(result('tu-1', `Created a new Artifact at ${PAGE} (version 1).`), {})).toEqual([]);
  });

  it('does not open anything when the result names no address', () => {
    const opener = new ArtifactAutoOpener();
    opener.recordPublishes(artifactCall('tu-1', { file_path: '/tmp/page.html' }));
    expect(opener.collectUrlsToOpen(result('tu-1', 'Created.'), {})).toEqual([]);
  });

  it('opens nothing when the user switched auto open off, and still consumes the call', () => {
    const opener = new ArtifactAutoOpener();
    opener.recordPublishes(artifactCall('tu-1', { file_path: '/tmp/page.html' }));
    const off = { CLAUDE_CODE_ARTIFACT_AUTO_OPEN: '0' };
    expect(opener.collectUrlsToOpen(result('tu-1', `Created a new Artifact at ${PAGE} (version 1).`), off)).toEqual([]);
    expect(opener.collectUrlsToOpen(result('tu-1', `Created a new Artifact at ${PAGE} (version 1).`), {})).toEqual([]);
  });

  it('opens a page once even if its result is delivered again', () => {
    const opener = new ArtifactAutoOpener();
    opener.recordPublishes(artifactCall('tu-1', { file_path: '/tmp/page.html' }));
    const event = result('tu-1', `Created a new Artifact at ${PAGE} (version 1).`);
    expect(opener.collectUrlsToOpen(event, {})).toEqual([PAGE]);
    expect(opener.collectUrlsToOpen(event, {})).toEqual([]);
  });

  it('ignores a tool_result it never saw the call for, such as a replayed history', () => {
    const opener = new ArtifactAutoOpener();
    expect(opener.collectUrlsToOpen(result('tu-old', `Created a new Artifact at ${PAGE} (version 1).`), {})).toEqual([]);
  });

  it('ignores events that are not assistant or user', () => {
    const opener = new ArtifactAutoOpener();
    opener.recordPublishes({ type: 'system', message: { content: [{ type: 'tool_use', id: 'x', name: 'Artifact', input: {} }] } });
    expect(opener.collectUrlsToOpen({ type: 'result' }, {})).toEqual([]);
  });
});
