import { describe, it, expect } from 'vitest';
import { tokenizeMessagePaths, pathFromToken, lineFromToken, resolveFilePath } from '../tokenizeMessagePaths';

describe('resolveFilePath', () => {
  it('상대경로를 워킹디렉토리와 결합해 절대경로로 만든다', () => {
    expect(resolveFilePath('src/file.ts', '/abs/project')).toBe('/abs/project/src/file.ts');
  });
  it('워킹디렉토리의 trailing slash를 중복 없이 처리한다', () => {
    expect(resolveFilePath('src/file.ts', '/abs/project/')).toBe('/abs/project/src/file.ts');
  });
  it('이미 절대경로면 그대로 둔다', () => {
    expect(resolveFilePath('/etc/hosts', '/abs/project')).toBe('/etc/hosts');
  });
  it('Windows 드라이브 절대경로(C:/…, C:\\…)는 그대로 둔다', () => {
    expect(resolveFilePath('C:/proj/file.ts', '/abs/project')).toBe('C:/proj/file.ts');
    expect(resolveFilePath('C:\\proj\\file.ts', '/abs/project')).toBe('C:\\proj\\file.ts');
  });
  it('워킹디렉토리가 없으면 상대경로를 그대로 반환한다', () => {
    expect(resolveFilePath('src/file.ts', null)).toBe('src/file.ts');
    expect(resolveFilePath('src/file.ts', undefined)).toBe('src/file.ts');
  });
});

describe('tokenizeMessagePaths', () => {
  it('빈 문자열은 빈 배열을 반환한다', () => {
    expect(tokenizeMessagePaths('')).toEqual([]);
  });

  it('경로가 없으면 전체를 평문 세그먼트 하나로 반환한다', () => {
    expect(tokenizeMessagePaths('Hello, world!')).toEqual([
      { text: 'Hello, world!', isPath: false },
    ]);
  });

  it('문장 중간의 @경로 앞뒤 평문을 보존한다', () => {
    const result = tokenizeMessagePaths('수정 대상은 @src/file.ts 입니다');
    expect(result).toEqual([
      { text: '수정 대상은 ', isPath: false },
      { text: '@src/file.ts', isPath: true },
      { text: ' 입니다', isPath: false },
    ]);
  });

  it('라인 범위 토큰을 하나의 경로로 인식한다', () => {
    const result = tokenizeMessagePaths('@src/file.ts#L10-L25 봐줘');
    expect(result).toEqual([
      { text: '@src/file.ts#L10-L25', isPath: true },
      { text: ' 봐줘', isPath: false },
    ]);
  });

  it('폴더 토큰(trailing slash)을 경로로 인식한다', () => {
    const result = tokenizeMessagePaths('@src/utils/ 안의 파일');
    expect(result).toEqual([
      { text: '@src/utils/', isPath: true },
      { text: ' 안의 파일', isPath: false },
    ]);
  });

  it('토큰 끝의 문장부호는 토큰에서 제외하고 평문으로 둔다', () => {
    const result = tokenizeMessagePaths('이 파일을 봐 @file.ts.');
    expect(result).toEqual([
      { text: '이 파일을 봐 ', isPath: false },
      { text: '@file.ts', isPath: true },
      { text: '.', isPath: false },
    ]);
  });

  it('여러 종류의 끝 문장부호를 제외한다', () => {
    const result = tokenizeMessagePaths('(@a.ts), [@b.ts]!');
    expect(result).toEqual([
      { text: '(', isPath: false },
      { text: '@a.ts', isPath: true },
      { text: '), [', isPath: false },
      { text: '@b.ts', isPath: true },
      { text: ']!', isPath: false },
    ]);
  });

  it('여러 토큰을 순서대로 반환한다', () => {
    const result = tokenizeMessagePaths('@a.ts and @b.ts');
    expect(result).toEqual([
      { text: '@a.ts', isPath: true },
      { text: ' and ', isPath: false },
      { text: '@b.ts', isPath: true },
    ]);
  });

  it('한글 사이의 토큰을 인식한다', () => {
    const result = tokenizeMessagePaths('여기@src/app.ts여기');
    // '@'는 공백 경계가 아니어도 매칭되며, 비공백 문자가 한글까지 흡수될 수 있으나
    // 한글은 경로 문자로 흔치 않으므로 토큰은 @ 이후 비공백을 흡수한다.
    expect(result[0]).toEqual({ text: '여기', isPath: false });
    expect(result[1].isPath).toBe(true);
    expect(result[1].text.startsWith('@src/app.ts')).toBe(true);
  });

  it('@ 단독은 토큰이 아니다', () => {
    const result = tokenizeMessagePaths('이메일 a@ 끝');
    expect(result).toEqual([{ text: '이메일 a@ 끝', isPath: false }]);
  });

  it('줄바꿈을 보존한다', () => {
    const result = tokenizeMessagePaths('첫줄 @a.ts\n둘째줄');
    expect(result).toEqual([
      { text: '첫줄 ', isPath: false },
      { text: '@a.ts', isPath: true },
      { text: '\n둘째줄', isPath: false },
    ]);
  });
});

describe('pathFromToken', () => {
  it('@ 접두를 제거한다', () => {
    expect(pathFromToken('@src/file.ts')).toBe('src/file.ts');
  });

  it('라인 범위(#L..-L..)를 제거한다', () => {
    expect(pathFromToken('@src/file.ts#L10-L25')).toBe('src/file.ts');
  });

  it('단일 라인 범위(#L..)를 제거한다', () => {
    expect(pathFromToken('@src/file.ts#L10')).toBe('src/file.ts');
  });

  it('컬럼 앵커(#L..C..)까지 제거한다', () => {
    expect(pathFromToken('@src/file.ts#L10C5')).toBe('src/file.ts');
    expect(pathFromToken('@src/file.ts#L10C5-L20C15')).toBe('src/file.ts');
  });

  it('폴더의 trailing slash를 보존한다', () => {
    expect(pathFromToken('@src/utils/')).toBe('src/utils/');
  });

  it('@ 없는 토큰도 처리한다', () => {
    expect(pathFromToken('src/file.ts')).toBe('src/file.ts');
  });
});

describe('lineFromToken', () => {
  it('#L10에서 라인 번호를 반환한다', () => {
    expect(lineFromToken('@src/file.ts#L10')).toBe(10);
  });

  it('#L10-L25 범위에서는 시작 라인을 반환한다', () => {
    expect(lineFromToken('@src/file.ts#L10-L25')).toBe(10);
  });

  it('#L10C5 컬럼 앵커에서도 라인 번호를 반환한다', () => {
    expect(lineFromToken('@src/file.ts#L10C5')).toBe(10);
  });

  it('라인 앵커가 없으면 undefined를 반환한다', () => {
    expect(lineFromToken('@src/file.ts')).toBeUndefined();
  });

  it('폴더 토큰은 undefined를 반환한다', () => {
    expect(lineFromToken('@src/utils/')).toBeUndefined();
  });
});

/**
 * `@@` addresses another live Claude session, not a file.
 *
 * The path pattern opens on the first `@` and stops at the first space, so a
 * session chip surfaced as `@@fix` — a chip reading half an address, that then
 * offered to open a file named `@fix`. The clickable half is the dangerous one.
 */
describe('tokenizeMessagePaths — session mentions are not paths', () => {
  it('leaves a session mention as plain text', () => {
    const segments = tokenizeMessagePaths('@@fix the proxy hello');

    expect(segments.every((s) => !s.isPath)).toBe(true);
    expect(segments.map((s) => s.text).join('')).toBe('@@fix the proxy hello');
  });

  it('leaves one whose title was cut short as plain text', () => {
    const segments = tokenizeMessagePaths('@@혹시 ListAgent 툴을 호출하지 않아도… 안녕');

    expect(segments.every((s) => !s.isPath)).toBe(true);
  });

  it('still finds a real file mention in the same message', () => {
    const segments = tokenizeMessagePaths('@@fix the proxy look at @src/App.tsx');

    expect(segments.filter((s) => s.isPath).map((s) => s.text)).toEqual(['@src/App.tsx']);
  });

  it('still finds a file mention that follows a session mention immediately', () => {
    const segments = tokenizeMessagePaths('@@fix @src/App.tsx');

    expect(segments.filter((s) => s.isPath).map((s) => s.text)).toEqual(['@src/App.tsx']);
  });

  it('does not lose any text while skipping a session mention', () => {
    const text = 'hey @@fix the proxy see @src/App.tsx now';
    const segments = tokenizeMessagePaths(text);

    expect(segments.map((s) => s.text).join('')).toBe(text);
  });
});
