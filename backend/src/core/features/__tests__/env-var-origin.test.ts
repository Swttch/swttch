import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { traceEnvVarOrigins, displayPath } from '../env-var-origin';

// The home-directory sweep is exercised through a project directory instead of by
// rewriting HOME: the two use the same findInFile/matcher pair, and pointing HOME at
// a temp dir mid-suite would leak into whatever else reads it.
describe('traceEnvVarOrigins', () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'env-origin-'));
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('finds the assignment in a project .env with its line number', async () => {
    await writeFile(join(project, '.env'), 'FOO=1\nANTHROPIC_API_KEY=sk-ant-secret\nBAR=2\n');

    const origins = await traceEnvVarOrigins('ANTHROPIC_API_KEY', project);

    expect(origins).toContainEqual({
      kind: 'dotenv',
      path: join(project, '.env'),
      line: 2,
    });
  });

  it('never reports the value, only where it is', async () => {
    // A key echoed into a chat transcript ends up in bug reports and screenshots.
    await writeFile(join(project, '.env'), 'ANTHROPIC_API_KEY=sk-ant-super-secret\n');

    const origins = await traceEnvVarOrigins('ANTHROPIC_API_KEY', project);

    expect(JSON.stringify(origins)).not.toContain('sk-ant-super-secret');
  });

  it("finds it in Claude's settings env block", async () => {
    await mkdir(join(project, '.claude'), { recursive: true });
    await writeFile(
      join(project, '.claude/settings.json'),
      '{\n  "env": {\n    "ANTHROPIC_API_KEY": "sk-ant-x"\n  }\n}\n',
    );

    const origins = await traceEnvVarOrigins('ANTHROPIC_API_KEY', project);

    expect(origins).toContainEqual({
      kind: 'claude-settings',
      path: join(project, '.claude/settings.json'),
      line: 3,
    });
  });

  it('reports every place it is set, not just the first', async () => {
    // Two files assigning the same name is exactly the state that confuses people:
    // they edit one, nothing changes, and they conclude the plugin ignored them.
    await writeFile(join(project, '.env'), 'ANTHROPIC_API_KEY=a\n');
    await writeFile(join(project, '.env.local'), 'ANTHROPIC_API_KEY=b\n');

    const origins = await traceEnvVarOrigins('ANTHROPIC_API_KEY', project);
    const paths = origins.map((o) => o.path);

    expect(paths).toContain(join(project, '.env'));
    expect(paths).toContain(join(project, '.env.local'));
  });

  it('ignores a commented-out assignment', async () => {
    await writeFile(join(project, '.env'), '# ANTHROPIC_API_KEY=old\nOTHER=1\n');

    const origins = await traceEnvVarOrigins('ANTHROPIC_API_KEY', project);

    expect(origins.filter((o) => o.path.endsWith('.env'))).toEqual([]);
  });

  it('does not match a different variable that merely contains the name', async () => {
    await writeFile(join(project, '.env'), 'MY_ANTHROPIC_API_KEY_BACKUP=x\n');

    const origins = await traceEnvVarOrigins('ANTHROPIC_API_KEY', project);

    expect(origins.filter((o) => o.path.endsWith('.env'))).toEqual([]);
  });

  it('matches `export NAME=` as well as a bare assignment', async () => {
    await writeFile(join(project, '.env'), 'export ANTHROPIC_API_KEY=sk-ant-x\n');

    const origins = await traceEnvVarOrigins('ANTHROPIC_API_KEY', project);

    expect(origins.map((o) => o.line)).toContain(1);
  });

  it('returns nothing for a name that is not a valid variable name', async () => {
    // The name reaches a RegExp; a crafted one must not become part of it.
    await writeFile(join(project, '.env'), 'ANTHROPIC_API_KEY=x\n');

    expect(await traceEnvVarOrigins('.*', project)).toEqual([]);
    expect(await traceEnvVarOrigins('A|B', project)).toEqual([]);
  });

  it('returns an empty list when nothing assigns it', async () => {
    // An empty result is an answer: the variable came from the command line, an
    // exported shell session, launchctl/setx, or the process that started the IDE.
    const origins = await traceEnvVarOrigins('ANTHROPIC_API_KEY_THAT_NOBODY_SETS', project);

    expect(origins).toEqual([]);
  });

});

describe('displayPath', () => {
  // The path exists to be read by a person, and the webview has no idea what the
  // home directory is, so the rewrite happens on the backend.
  it('홈 아래 경로를 ~ 로 줄인다', () => {
    expect(displayPath('/home/deth/.zshrc', '/home/deth')).toBe('~/.zshrc');
  });

  it('홈 자체도 ~ 로 줄인다', () => {
    expect(displayPath('/home/deth', '/home/deth')).toBe('~');
  });

  it('홈 밖의 경로는 그대로 둔다', () => {
    expect(displayPath('/etc/environment', '/home/deth')).toBe('/etc/environment');
  });

  it('홈 이름으로 시작만 하는 다른 디렉토리를 줄이지 않는다', () => {
    // `/home/deth-backup` is not inside `/home/deth`.
    expect(displayPath('/home/deth-backup/.zshrc', '/home/deth')).toBe('/home/deth-backup/.zshrc');
  });
});
