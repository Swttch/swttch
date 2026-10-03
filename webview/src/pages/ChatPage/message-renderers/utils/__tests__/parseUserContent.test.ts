import { describe, it, expect } from 'vitest';
import { parseUserContent } from '../parseUserContent';

describe('parseUserContent', () => {
  it('태그 없는 일반 텍스트를 그대로 반환한다', () => {
    const result = parseUserContent('Hello, world!');
    expect(result.text).toBe('Hello, world!');
    expect(result.contexts).toEqual([]);
  });

  it('<ide_opened_file> 태그에서 파일 경로를 추출한다', () => {
    const content = '<ide_opened_file>The user opened the file /Users/test/project/src/App.tsx in the IDE. This may or may not be related to the current task.</ide_opened_file>\n안녕하세요';
    const result = parseUserContent(content);

    expect(result.text).toBe('안녕하세요');
    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0]).toMatchObject({
      type: 'file',
      path: '/Users/test/project/src/App.tsx',
    });
  });

  it('<ide_selection> 태그에서 선택 영역 정보를 추출한다', () => {
    const content = '<ide_selection>The user selected the lines 42 to 51 from /Users/test/project/src/App.tsx:\nconst foo = "bar";\nconst baz = 123;\n\nThis may or may not be related to the current task.</ide_selection>\n이 코드를 수정해줘';
    const result = parseUserContent(content);

    expect(result.text).toBe('이 코드를 수정해줘');
    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0]).toMatchObject({
      type: 'selection',
      path: '/Users/test/project/src/App.tsx',
      startLine: 42,
      endLine: 51,
    });
    expect(result.contexts[0].content).toContain('const foo = "bar"');
  });

  it('여러 태그를 동시에 처리한다', () => {
    const content = '<ide_opened_file>The user opened the file /path/a.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>\n<ide_opened_file>The user opened the file /path/b.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>\n메시지';
    const result = parseUserContent(content);

    expect(result.text).toBe('메시지');
    expect(result.contexts).toHaveLength(2);
    expect(result.contexts[0].path).toBe('/path/a.ts');
    expect(result.contexts[1].path).toBe('/path/b.ts');
  });

  it('<system-reminder> 태그를 제거하되 context로 추출하지 않는다', () => {
    const content = '<system-reminder>Some system info here</system-reminder>\n질문입니다';
    const result = parseUserContent(content);

    expect(result.text).toBe('질문입니다');
    expect(result.contexts).toEqual([]);
  });

  it('혼합된 태그를 모두 처리한다', () => {
    const content = '<ide_opened_file>The user opened the file /path/file.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>\n<system-reminder>Reminder text</system-reminder>\n사용자 메시지';
    const result = parseUserContent(content);

    expect(result.text).toBe('사용자 메시지');
    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0].type).toBe('file');
  });

  it('태그 제거 후 과도한 줄바꿈을 정리한다', () => {
    const content = '<ide_opened_file>The user opened the file /path/file.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>\n\n\n\n메시지';
    const result = parseUserContent(content);

    expect(result.text).toBe('메시지');
  });

  it('태그만 있고 사용자 텍스트가 없는 경우 빈 문자열을 반환한다', () => {
    const content = '<ide_opened_file>The user opened the file /path/file.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>';
    const result = parseUserContent(content);

    expect(result.text).toBe('');
    expect(result.contexts).toHaveLength(1);
  });

  it('local-command-stdout이 있으면 플래그를 세우고 내용은 보존한다', () => {
    const content = '<local-command-stdout>Set model to claude-opus-4-8[1m]</local-command-stdout>';
    const result = parseUserContent(content);

    expect(result.hasLocalCommandStdout).toBe(true);
    expect(result.text).toBe('Set model to claude-opus-4-8[1m]');
  });

  it('keeps both the command name and its arguments for a stored slash command', () => {
    const content =
      '<command-name>/rename</command-name>\n' +
      '            <command-message>rename</command-message>\n' +
      '            <command-args>Issue #384 - reconnect problem</command-args>';
    const result = parseUserContent(content);

    expect(result.commandName).toBe('rename');
    expect(result.text).toBe('Issue #384 - reconnect problem');
  });

  it('leaves empty text for a slash command without arguments', () => {
    const content =
      '<command-name>/clear</command-name>\n' +
      '            <command-message>clear</command-message>\n' +
      '            <command-args></command-args>';
    const result = parseUserContent(content);

    expect(result.commandName).toBe('clear');
    expect(result.text).toBe('');
  });

  it('local-command-stdout이 없으면 플래그가 거짓이다', () => {
    const result = parseUserContent('일반 사용자 메시지');

    expect(result.hasLocalCommandStdout).toBe(false);
  });
});
