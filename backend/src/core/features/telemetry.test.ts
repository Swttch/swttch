import { describe, it, expect, vi, afterEach } from 'vitest';
import { MessageType } from '../../shared';

// config/environment를 hoisted mock으로 대체하고, telemetry가 읽는 API 키만 holder로
// 주입한다. process.env(_CCG_RYBBIT_API_KEY) 전역 stub을 쓰지 않는 이유: process.env는
// 워커 프로세스 전역이라 다른 테스트 파일과 공유되고, vitest 병렬 실행 시 이 파일이 읽기
// 직전에 원복/오염될 수 있다 → RYBBIT_API_KEY 빈 값 → send() 조기 return → flush 후
// fetch 0회로 산발 실패(#192). holder는 파일-로컬이라 그 전역 경합에서 완전히 벗어난다.
const envHolder = vi.hoisted(() => ({ apiKey: '' }));
vi.mock('../../config/environment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/environment')>();
  return {
    ...actual,
    get CCG_RYBBIT_API_KEY() {
      return envHolder.apiKey;
    },
  };
});

// profile도 같은 이유로 hoisted mock이다. 테스트마다 값이 달라지는 것은 holder를 바꿔서
// 표현하고, mock 자체는 파일 전 구간에서 절대 걷히지 않게 한다. doMock/doUnmock으로 매번
// 붙였다 떼면 "떼어진 창"이 생기고, 그 창에 아직 살아 있던 전송이 readProfile()을 재개하면
// **사용자의 실제 프로필 파일**(실제 UUID·실제 동의 상태)을 읽어 전송을 시도한다. 실측에서
// 실제 UUID가 fetch body에 찍히는 것을 확인했다. 테스트는 어떤 타이밍에도 사용자 자산을
// 읽어선 안 되므로, 창을 없애는 쪽으로 고정한다.
const profileHolder = vi.hoisted(() => ({
  current: { uuid: 'test-uuid', telemetryConsent: { status: 'pending', decidedAt: null } } as {
    uuid: string;
    telemetryConsent: { status: string; decidedAt: string | null };
  },
}));
vi.mock('./profile', () => ({
  readProfile: async () => profileHolder.current,
  ConsentStatus: { PENDING: 'pending', ACCEPTED: 'accepted', DENIED: 'denied' },
}));

// 동의 상태별 전송 게이팅 검증. profile/settings/version을 주입한 뒤 telemetry 모듈을
// 동적 import하여(모듈 로드 시 API key를 const로 고정하므로) fetch 호출 여부를 본다.
// trackEvent/trackError는 fire-and-forget(void)이라 flushTelemetry()로 결정적으로 기다린다.

interface TestProfile {
  uuid: string;
  telemetryConsent: { status: string; decidedAt: string | null };
}

const accepted: TestProfile = {
  uuid: 'test-uuid',
  telemetryConsent: { status: 'accepted', decidedAt: '2026-01-01T00:00:00.000Z' },
};
const denied: TestProfile = {
  uuid: 'test-uuid',
  telemetryConsent: { status: 'denied', decidedAt: '2026-01-01T00:00:00.000Z' },
};
const pending: TestProfile = {
  uuid: 'test-uuid',
  telemetryConsent: { status: 'pending', decidedAt: null },
};

function mockCommonDeps() {
  vi.doMock('../handlers/getVersion', () => ({
    getPluginVersion: () => '0.0.0-test',
    getCliVersion: async () => '1.0.0',
  }));
}

/** 직전 테스트가 로드한 telemetry 모듈. resetModules 전에 비워내기 위해 붙잡아 둔다. */
let loadedTelemetry: typeof import('./telemetry') | null = null;

async function loadTelemetry(
  profile: TestProfile,
  apiKey: string,
  fetchImpl?: (input: string, init: { body: string }) => Promise<unknown>,
) {
  // inFlight는 모듈 스코프 상태라 resetModules()가 새 인스턴스에 빈 Set을 만든다. 직전
  // 테스트의 전송이 아직 떠 있는 채로 리셋하면, 그 전송을 기다려 줄 주체가 사라진다 —
  // 새 인스턴스의 flushTelemetry()는 자기 빈 Set만 보고 즉시 반환하고, 뒤늦게 끝난 옛
  // 전송이 새 테스트의 fetchMock에 얹혀 "보내지 않아야 할 때 1번 호출됨"으로 터진다.
  // 리셋 전에 옛 인스턴스를 직접 비워, 전송이 자기 인스턴스보다 오래 살지 못하게 한다.
  if (loadedTelemetry) {
    await loadedTelemetry.flushTelemetry();
    loadedTelemetry = null;
  }
  vi.resetModules();
  // hoisted environment mock의 CCG_RYBBIT_API_KEY getter가 반환할 값을 이 파일에 주입한다
  // (process.env 전역을 건드리지 않음 — 상단 mock 주석 참고).
  envHolder.apiKey = apiKey;
  // profile은 hoisted mock이라 붙였다 떼지 않는다 — 값만 갈아끼운다(상단 mock 주석 참고).
  profileHolder.current = profile;
  mockCommonDeps();
  const fetchMock = vi.fn(fetchImpl ?? (async () => ({ ok: true })));
  vi.stubGlobal('fetch', fetchMock);
  const mod = await import('./telemetry');
  loadedTelemetry = mod;
  return {
    trackEvent: mod.trackEvent,
    trackError: mod.trackError,
    trackActivity: mod.trackActivity,
    flushTelemetry: mod.flushTelemetry,
    fetchMock,
  };
}

/**
 * 그 테스트가 띄운 전송을 비운 뒤에 mock/stub을 걷는다. 각 describe의 afterEach는 이
 * 함수 하나만 부른다 — 드레인과 unmock의 **순서**가 이 테스트의 결정성을 좌우하기 때문이다.
 *
 * vitest는 describe의 afterEach를 파일 최상위 afterEach보다 **먼저** 실행한다(실측). 그래서
 * 드레인을 파일 최상위에 두고 언스텁을 describe에 두면 순서가 뒤집힌다 — 아직 살아 있는
 * 전송이 언스텁 이후에 재개해, 다음 테스트가 stub한 fetchMock으로 전송해버린다.
 * "PENDING인데 1번 호출됨"으로 산발 실패하던 경로가 이것이다(#192 방어가 이 순서 때문에
 * 무력화됨). 드레인을 언스텁과 같은 훅 안에 두고 앞에 세워 순서를 고정한다.
 */
async function drainThenUnmock() {
  if (loadedTelemetry) await loadedTelemetry.flushTelemetry();
  vi.unstubAllGlobals();
  vi.doUnmock('../handlers/getVersion');
}

describe('telemetry consent gating', () => {
  afterEach(drainThenUnmock);

  it('ACCEPTED + API key면 전송한다', async () => {
    const { trackEvent, fetchMock, flushTelemetry } = await loadTelemetry(accepted, 'test-key');
    trackEvent('e', { a: '1' });
    await flushTelemetry();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('PENDING(미응답)이면 전송하지 않는다', async () => {
    const { trackEvent, fetchMock, flushTelemetry } = await loadTelemetry(pending, 'test-key');
    trackEvent('e', {});
    await flushTelemetry();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('DENIED(거부·철회)면 전송하지 않는다', async () => {
    const { trackEvent, fetchMock, flushTelemetry } = await loadTelemetry(denied, 'test-key');
    trackEvent('e', {});
    await flushTelemetry();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requireConsent=false면 DENIED여도 전송한다(철회 사실 전송)', async () => {
    const { trackEvent, fetchMock, flushTelemetry } = await loadTelemetry(denied, 'test-key');
    trackEvent('telemetry_consent', { action: 'deny' }, { requireConsent: false });
    await flushTelemetry();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('API key가 없으면(개발 빌드) 동의했어도 전송하지 않는다', async () => {
    const { trackEvent, fetchMock, flushTelemetry } = await loadTelemetry(accepted, '');
    trackEvent('e', {});
    await flushTelemetry();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('trackError도 동일한 동의 게이팅을 따른다', async () => {
    const { trackError, fetchMock, flushTelemetry } = await loadTelemetry(denied, 'test-key');
    trackError(new Error('boom'), {});
    await flushTelemetry();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('전송 중 에러가 나도 throw하지 않는다(에러 격리)', async () => {
    const { trackEvent, flushTelemetry } = await loadTelemetry(accepted, 'test-key', async () => {
      throw new Error('network down');
    });
    expect(() => trackEvent('e', {})).not.toThrow();
    await flushTelemetry(); // unhandled rejection 없이 조용히 삼켜져야 한다
  });

  it('properties가 4096자를 넘으면 잘라서 보낸다(fitProperties)', async () => {
    const { trackEvent, fetchMock, flushTelemetry } = await loadTelemetry(accepted, 'test-key');
    trackEvent('e', { big: 'x'.repeat(5000) });
    await flushTelemetry();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.properties.length).toBeLessThanOrEqual(4096);
  });

  it('서버가 거부(ok=false)하면 transport_error로 1회 재전송한다', async () => {
    const { trackEvent, fetchMock, flushTelemetry } = await loadTelemetry(accepted, 'test-key', async () => ({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    }));
    trackEvent('e', {});
    await flushTelemetry();
    // 원본 1회 + transport_error 1회(재귀 가드로 그 이상은 없음)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('trackActivity (활동 단일 진입점)', () => {
  afterEach(drainThenUnmock);

  it("event_name='activity:<메시지 타입>' 형태로 전송한다", async () => {
    const { trackActivity, fetchMock, flushTelemetry } = await loadTelemetry(accepted, 'test-key');
    trackActivity(MessageType.SEND_MESSAGE);
    await flushTelemetry();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event_name).toBe('activity:SEND_MESSAGE');
  });

  it('디바운스가 없다 — 연속 호출마다 1:1로 전송한다', async () => {
    const { trackActivity, fetchMock, flushTelemetry } = await loadTelemetry(accepted, 'test-key');
    trackActivity(MessageType.SEND_MESSAGE);
    trackActivity(MessageType.LOAD_SESSION);
    trackActivity(MessageType.APPLY_DIFF);
    await flushTelemetry();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('제외 타입(시스템/폴링/자동 조회)은 활동으로 전송하지 않는다', async () => {
    const { trackActivity, fetchMock, flushTelemetry } = await loadTelemetry(accepted, 'test-key');
    const excluded = [
      MessageType.CLIENT_INFO, MessageType.CLIENT_ERROR, MessageType.GET_ACCOUNT, MessageType.GET_USAGE, MessageType.PANEL_FOCUSED,
      MessageType.GET_TELEMETRY_CONSENT, MessageType.GET_CLI_CONFIG, MessageType.GET_IDE_ROOT, MessageType.GET_VERSION,
      MessageType.GET_CLI_UPDATE_INFO,
      MessageType.GET_PLUGIN_UPDATES, MessageType.GET_TUNNEL_STATUS, MessageType.GET_TUNNEL_PREREQS, MessageType.GET_WORKING_DIR,
      MessageType.GET_AVAILABLE_TERMINALS, MessageType.GET_DETECTED_CLI_PATH, MessageType.GET_DETECTED_NODE_PATH,
      MessageType.GET_SETTINGS, MessageType.GET_CLAUDE_SETTINGS, MessageType.GET_SESSIONS, MessageType.RECLAIM_SESSION, MessageType.LIST_PROJECT_FILES,
    ];
    excluded.forEach((t) => trackActivity(t));
    await flushTelemetry();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('능동 행동·약신호 타입(SEND_MESSAGE/SAVE_SETTINGS/LOAD_SESSION/GET_PROJECTS)은 전송한다', async () => {
    const { trackActivity, fetchMock, flushTelemetry } = await loadTelemetry(accepted, 'test-key');
    const kept = [MessageType.SEND_MESSAGE, MessageType.SAVE_SETTINGS, MessageType.LOAD_SESSION, MessageType.GET_PROJECTS];
    kept.forEach((t) => trackActivity(t));
    await flushTelemetry();
    expect(fetchMock).toHaveBeenCalledTimes(kept.length);
  });

  it('미동의(DENIED)면 활동도 전송하지 않는다(동의 게이팅)', async () => {
    const { trackActivity, fetchMock, flushTelemetry } = await loadTelemetry(denied, 'test-key');
    trackActivity(MessageType.SEND_MESSAGE);
    await flushTelemetry();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
