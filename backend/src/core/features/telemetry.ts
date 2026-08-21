import { readProfile, ConsentStatus } from './profile';
import { homedir, release } from 'os';
import { getPluginVersion, getCliVersion } from '../handlers/getVersion';
import { basename } from 'path';
import { MessageType } from '../../shared';
import {
  CCG_RYBBIT_API_KEY as RYBBIT_API_KEY,
  RYBBIT_HOST,
  RYBBIT_SITE_ID,
  ccgClientInfo,
  isJetBrainsMode,
} from '../../config/environment';

// ─── Telemetry transport (Rybbit) ────────────────────────────────────────────
// Sends custom events / errors to the self-hosted Rybbit instance, but ONLY when
// telemetry consent status is ACCEPTED. The API key is injected at build time
// (esbuild define) — never committed as a source constant. The Bearer key makes
// Rybbit treat these as trusted server-side ingestion (bypasses its bot filter).
//
// Transport rules (apply to EVERY event):
//   1. Any error (network, fs, parsing, ...) is swallowed so it can never affect
//      the app — the whole body is wrapped in a single try/catch.
//   2. Callers MUST NOT await these functions or chain then/catch/finally. They
//      are fire-and-forget; nothing depends on the transmission result.
//
// Every event also carries a fixed set of common fields (os, osVer, terminal,
// pluginVer, claudeCliVer, client) merged in by send(). The full settings snapshot
// is intentionally NOT sent: Rybbit /api/track caps properties at 4096 chars and has
// no feature_flags field, so settings will move to our own api+Postgres later.

// RYBBIT_HOST / RYBBIT_SITE_ID / RYBBIT_API_KEY 는 config/environment.ts 단일점에서
// 가져온다. API 키만 빌드 타임 박제(.env의 `_CCG_RYBBIT_API_KEY`), 나머지는 공개 상수.
const TRACK_ENDPOINT = `${RYBBIT_HOST}/api/track`;
// 전송 자체 실패를 보고하는 에러 이벤트 이름. 무한루프 방지용 재귀 가드의 기준이 된다.
const TRANSPORT_ERROR_EVENT = 'telemetry_transport_error';

// 진행 중인 fire-and-forget 전송 추적. flushTelemetry()로 모두 끝날 때까지 기다릴 수 있다
// (테스트 결정성 + 향후 graceful shutdown 시 pending 전송 비우기 용도).
const inFlight = new Set<Promise<void>>();
function fireAndForget(p: Promise<void>): void {
  inFlight.add(p);
  void p.finally(() => inFlight.delete(p));
}

/** 진행 중인 모든 텔레메트리 전송이 끝날 때까지 기다린다(transport_error 재귀 포함). */
export async function flushTelemetry(): Promise<void> {
  // 완료된 전송이 자기 promise 안에서 2차 전송(transport_error 재귀)을 add하는데, 이는
  // 원본이 inFlight에서 제거되는 것과 거의 같은 틱에 일어난다. Set이 빈 뒤에도 microtask를
  // 한 번 양보하고 다시 확인해, 뒤늦게 추가된 재전송까지 반드시 기다린다(부하 시 fetch 횟수
  // 경합 방지).
  do {
    while (inFlight.size > 0) {
      await Promise.allSettled([...inFlight]);
    }
    await Promise.resolve();
  } while (inFlight.size > 0);
}

// 서버사이드 전송이라 실제 브라우저 UA가 없다. Rybbit은 UA로 device/os를 파싱하는데,
// UA가 없으면 Mobile/Unknown으로 떨어진다. Bearer(신뢰 수집)에서는 user_agent override가
// 허용되므로, OS에 맞는 데스크톱 UA를 보내 device=desktop과 OS를 정확히 잡게 한다.
function buildUserAgent(): string {
  switch (process.platform) {
    case 'darwin':
      return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    case 'win32':
      return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    default:
      return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }
}
const RYBBIT_USER_AGENT = buildUserAgent();

/** Rybbit track payload type. */
enum TrackType {
  EVENT = 'custom_event',
  ERROR = 'error',
}

/** 이벤트에 실어 보낼 부가 속성. 원시값만 허용한다. */
export interface TelemetryProperties {
  [key: string]: string | number | boolean;
}

/** 전송 옵션. requireConsent=false는 동의 철회 사실처럼 "이전 동의 하에" 보내는 특수 경우에만 사용. */
export interface TelemetryOptions {
  requireConsent?: boolean;
}

/** 텍스트 내 홈 디렉토리 경로를 '~'로 치환한다(에러 메시지·스택의 username 등 개인정보 제거). */
function sanitizeText(text: string): string {
  const home = homedir();
  return home.length > 0 ? text.split(home).join('~') : text;
}

// Claude CLI 버전은 프로세스 spawn이라 비싸다. 1회 조회 후 캐싱한다(undefined=미조회).
let cachedCliVersion: string | null | undefined;
async function getCachedCliVersion(): Promise<string> {
  if (cachedCliVersion === undefined) {
    cachedCliVersion = await getCliVersion();
  }
  return cachedCliVersion ?? '';
}

// Standalone(브라우저) 모드에서 webview가 연결 시 전달하는 navigator.userAgent를 보관한다.
// 브라우저 환경엔 env로 주입할 주체(Kotlin)가 없으므로 webview가 알려준다.
let browserClient = '';

/** webview(브라우저)가 알려준 클라이언트 식별자(UA 등)를 저장한다. */
export function setBrowserClient(client: string): void {
  browserClient = client;
}

/**
 * 클라이언트(IDE/브라우저) 종류+빌드. 우선순위:
 * 1) CCG_CLIENT_INFO env — JetBrains(Kotlin)가 제품+빌드를 주입.
 * 2) webview가 전달한 브라우저 UA(setBrowserClient) — standalone 모드.
 * 3) 모드만으로 fallback('jetbrains'/'browser').
 */
function getClientInfo(): string {
  if (ccgClientInfo.length > 0) return ccgClientInfo;
  if (browserClient.length > 0) return browserClient;
  return isJetBrainsMode ? 'jetbrains' : 'browser';
}

/**
 * The raw client identifier, or '' when only the mode fallback is known.
 *
 * About needs to tell "we know what this client is" from "we are guessing from
 * the run mode", which getClientInfo() flattens by returning 'jetbrains' /
 * 'browser' for the unknown case. Telemetry keeps using that flattened value.
 */
export function getRawClientInfo(): string {
  if (ccgClientInfo.length > 0) return ccgClientInfo;
  if (browserClient.length > 0) return browserClient;
  return '';
}

/**
 * 사용자의 셸 종류(zsh/bash/powershell 등)를 감지한다. Unix는 $SHELL, Windows는
 * PowerShell(PSModulePath 존재)/cmd($ComSpec)로 판별한다. 미확인이면 빈 문자열.
 */
// SHELL/ComSpec/PSModulePath 직접 참조는 OS 셸 종류 탐지 목적이다(detectTerminals.ts의
// OS 경로 탐색과 같은 분류). 설정성 변수가 아니라 environment.ts 단일점 대상에서 제외한다.
function detectShell(): string {
  if (process.platform === 'win32') {
    if (process.env.PSModulePath) return 'powershell';
    return process.env.ComSpec ? basename(process.env.ComSpec) : '';
  }
  return process.env.SHELL ? basename(process.env.SHELL) : '';
}

// Rybbit /api/track의 properties(JSON 문자열) 최대 길이. 서버 zod 스키마가 "at most 4096"으로
// 거부하므로(실측 확인) 그 최대치에 맞춘다. 초과하면 가장 긴 값(stack 등)을 잘라 한도를 지킨다.
const PROPERTIES_MAX = 4096;
const TRUNCATION_MARK = '…[truncated]';

/**
 * properties를 JSON 직렬화했을 때 4096자를 넘으면, 가장 긴 문자열 값부터 잘라 한도에 맞춘다.
 * stack/detail 같은 큰 값이 전송 자체를 400으로 막는 것을 방지한다(어떤 키든 일괄 보장).
 */
function fitProperties(props: TelemetryProperties): TelemetryProperties {
  if (JSON.stringify(props).length <= PROPERTIES_MAX) return props;
  const out: TelemetryProperties = { ...props };
  // 한도를 넘는 동안, 매번 가장 긴 문자열 값을 골라 "한도 안에 들어가는 최대 보존 길이"까지
  // 이진 탐색으로 줄인다. 자를 양을 원본 문자열 길이가 아니라 **JSON 직렬화 길이**로 직접
  // 판정하므로, stack의 '\n'이 JSON에서 '\\n'으로 늘어나도 한도(4096)를 알뜰히 채운다.
  for (;;) {
    if (JSON.stringify(out).length <= PROPERTIES_MAX) break;
    let key: string | undefined;
    let maxLen = 0;
    for (const [k, v] of Object.entries(out)) {
      if (typeof v === 'string' && v.length > maxLen) { maxLen = v.length; key = k; }
    }
    if (key === undefined || maxLen <= TRUNCATION_MARK.length) break; // 더 줄일 문자열 없음
    const current = out[key] as string;
    // out[key] = slice(0, mid) + mark 했을 때 전체가 한도 이하가 되는 최대 mid를 찾는다.
    let lo = 0;
    let hi = current.length - TRUNCATION_MARK.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      out[key] = current.slice(0, mid) + TRUNCATION_MARK;
      if (JSON.stringify(out).length <= PROPERTIES_MAX) lo = mid;
      else hi = mid - 1;
    }
    out[key] = current.slice(0, lo) + TRUNCATION_MARK;
    // mark만 남겨도(lo=0) 여전히 초과면, 다음 루프에서 이 값은 짧아져 다른(다음으로 긴) 값이
    // 선택된다. 모든 값이 mark 이하로 줄어 더 못 줄이면 위 가드에서 멈춘다.
  }
  return out;
}

/**
 * 모든 이벤트에 공통으로 실리는 properties 필드(고정 순서). settings 전체는 Rybbit
 * /api/track 한도(properties 4096, feature_flags 미지원) 때문에 여기 싣지 않는다.
 */
function buildCommonFields(terminal: string, cliVer: string): TelemetryProperties {
  return {
    os: process.platform,
    osVer: release(),
    terminal,
    pluginVer: getPluginVersion(),
    claudeCliVer: cliVer,
    client: getClientInfo(),
  };
}

/**
 * 단일 try/catch로 감싸 어떤 에러도 앱에 새지 않게 한다(규칙 1). 호출자는 await하지
 * 않으므로(규칙 2) 이 함수의 내부 await는 앱 실행을 지연시키지 않는다.
 * 전송 자체가 실패하면 그 사실도 에러 이벤트(TRANSPORT_ERROR_EVENT)로 보고하되,
 * 그 보고가 또 실패하면 재보고하지 않는다(재귀 가드).
 */
async function send(
  type: TrackType,
  eventName: string,
  properties: TelemetryProperties,
  options: TelemetryOptions,
): Promise<void> {
  try {
    if (!RYBBIT_API_KEY) return; // 키 미주입 빌드 — 전송 안 함
    const profile = await readProfile();
    const requireConsent = options.requireConsent ?? true;
    if (requireConsent && profile.telemetryConsent.status !== ConsentStatus.ACCEPTED) {
      return;
    }

    // 공통 필드(고정 순서)를 먼저, 이벤트 고유 속성을 뒤에 둔다. settings 전체는 Rybbit
    // /api/track 한도 때문에 싣지 않는다(추후 자체 api로 이전 — ccg-telemetry-settings).
    const common = buildCommonFields(detectShell(), await getCachedCliVersion());
    // 공통 + 이벤트 고유 속성을 합치고, properties 4096 한도에 맞게 큰 값(stack 등)을 자른다.
    const merged = fitProperties({ ...common, ...properties });

    const body = {
      site_id: RYBBIT_SITE_ID,
      // user_id로 보내야 Rybbit이 "식별된 사용자"로 묶는다(가명 설치 ID).
      user_id: profile.uuid,
      // device/os 정확도를 위한 데스크톱 UA override(서버사이드 + Bearer라 허용됨).
      user_agent: RYBBIT_USER_AGENT,
      type,
      event_name: eventName,
      properties: JSON.stringify(merged),
      hostname: 'jetbrains.just-swttch.com',
      pathname: '/',
    };

    const res = await fetch(TRACK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RYBBIT_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    // fetch는 4xx/5xx를 reject하지 않는다. 서버 거부(예: properties 초과 400)를 흘리지 않도록
    // 명시적으로 확인해 transport error로 보고한다(재귀 가드: transport error 자신은 제외).
    if (!res.ok && eventName !== TRANSPORT_ERROR_EVENT) {
      const detail = sanitizeText(await res.text().catch(() => '')).slice(0, 300);
      fireAndForget(send(
        TrackType.ERROR,
        TRANSPORT_ERROR_EVENT,
        { message: `HTTP ${res.status}`, detail, failedEvent: eventName },
        options,
      ));
    }
  } catch (err) {
    // 전송 자체 에러도 디버깅용 에러 이벤트로 보고한다(재귀 가드: transport error 보고는 재시도 안 함).
    if (eventName !== TRANSPORT_ERROR_EVENT) {
      const message = err instanceof Error ? sanitizeText(err.message) : String(err);
      fireAndForget(send(TrackType.ERROR, TRANSPORT_ERROR_EVENT, { message, failedEvent: eventName }, options));
    }
    // 그 외 모든 에러는 흘린다(앱에 영향 0).
  }
}

/**
 * 커스텀 이벤트를 전송한다. **호출 시 await/then/catch/finally 금지** — `void trackEvent(...)`.
 * 기본은 동의(ACCEPTED) 시에만 전송. requireConsent=false는 철회 사실 전송 등 특수 경우 한정.
 */
export function trackEvent(
  eventName: string,
  properties: TelemetryProperties = {},
  options: TelemetryOptions = {},
): void {
  fireAndForget(send(TrackType.EVENT, eventName, properties, options));
}

// 활동으로 추적하지 않는 메시지 타입. 사용자 능동 행동이 아니라 시스템/자동 트래픽이다.
// 판단 기준: 사용자 의도 없이 앱이 자기 상태를 파악하려 자동(마운트·포커스·폴링)으로
// 부르는 read-only 조회는 노이즈로 제외하고, 사용자가 직접 일으킨 동작(SEND/SAVE/SET/OPEN
// /CREATE/APPLY…)만 활동으로 남긴다. GET_PROJECTS·LOAD_SESSION은 화면 진입/세션 전환의
// 약한 행동 신호라 의도적으로 유지한다.
const ACTIVITY_EXCLUDED_TYPES = new Set<string>([
  // 시스템 / 에러 / 폴링성 자동 트래픽
  MessageType.CLIENT_INFO,           // 순수 WS 연결 핸드셰이크
  MessageType.CLIENT_ERROR,          // 에러 보고(reportBackendError 경로)
  MessageType.GET_ACCOUNT,           // 창 포커스마다 자동 refetch
  MessageType.GET_USAGE,             // 사용량 조회 폴링성
  MessageType.PANEL_FOCUSED,         // 패널 포커스마다 자동 발생하는 라우팅 신호(노이즈)
  // 인프라 / 환경 / 버전 자동 조회 (마운트 시 버스트)
  MessageType.GET_TELEMETRY_CONSENT, // 동의 상태 자동 조회
  MessageType.GET_CLI_CONFIG,        // CLI 설정 자동 로드
  MessageType.GET_IDE_ROOT,          // IDE 루트 자동 조회
  MessageType.GET_VERSION,           // 버전 자동 표시(About 리로드 클릭만 능동)
  MessageType.GET_CLI_UPDATE_INFO,   // CLI 업데이트 가능 여부 자동 조회(About 마운트 시)
  MessageType.GET_PLUGIN_UPDATES,    // 업데이트 확인(폴링성)
  MessageType.GET_TUNNEL_STATUS,     // 터널 상태(폴링성)
  MessageType.GET_TUNNEL_PREREQS,    // 터널 사전조건 조회
  MessageType.GET_WORKING_DIR,       // 작업 디렉토리 자동 조회
  MessageType.GET_AVAILABLE_TERMINALS, // 터미널 탐지(설정 마운트)
  MessageType.GET_DETECTED_CLI_PATH,   // CLI 경로 탐지
  MessageType.GET_DETECTED_NODE_PATH,  // Node 경로 탐지
  // 콘텐츠 자동 로드 (마운트 버스트, 화면 진입은 OPEN_*/능동 행동으로 별도 포착)
  MessageType.GET_SETTINGS,          // 설정 자동 로드
  MessageType.GET_CLAUDE_SETTINGS,   // Claude 설정 자동 로드
  MessageType.GET_SESSIONS,          // 세션 목록 자동 로드
  MessageType.RECLAIM_SESSION,       // 탭 자동 복원
  MessageType.LIST_PROJECT_FILES,    // @멘션 파일 검색(타이핑 중 자동 빈발)
]);

/**
 * webview→backend 요청의 **단일 진입점**에서 호출하는 "활동" 기록기. reportBackendError가
 * 에러의 단일 진입점인 것과 대칭이다. Rybbit은 user_id 기준 30분 무이벤트면 세션을 끊는데,
 * 단발 이벤트만으로는 "사용 중"을 측정할 수 없다. 요청이 들어올 때마다 'activity'를 보내
 * 세션을 실제 활동 동안 살려두고, properties.type으로 어떤 행동이었는지도 남긴다.
 *
 * 디바운스/타이머 없이 요청마다 **1:1로 전송**한다 — 실제 요청이 있을 때만 보내므로 idle
 * 시 전송 0(세션 자연 만료, heartbeat 같은 인공 신호와 다름). 시스템/생명주기 메시지는
 * 사용자 활동이 아니라 제외한다. 동의 게이팅은 trackEvent에 위임한다.
 *
 * 이벤트명은 `activity:<메시지 타입>`(예: `activity:SEND_MESSAGE`)로 보낸다. Rybbit 이벤트
 * 목록에 행동별로 바로 뜨고, `activity:` prefix로 묶어 세션 유지/그룹 분석을 할 수 있다.
 * **호출 시 await/then/catch/finally 금지** — `void trackActivity(...)`.
 */
export function trackActivity(type: string): void {
  if (ACTIVITY_EXCLUDED_TYPES.has(type)) return;
  trackEvent(`activity:${type}`);
}

/**
 * 에러를 전송한다. **호출 시 await/then/catch/finally 금지** — `void trackError(...)`.
 * Rybbit "오류" 대시보드가 props.message / props.stack을 추출하므로 그 키로 담는다.
 * message·stack은 홈 경로를 '~'로 치환해 개인정보(경로 username 등)를 제거한다.
 */
export function trackError(
  error: Error,
  context: TelemetryProperties = {},
  options: TelemetryOptions = {},
): void {
  const props: TelemetryProperties = { message: sanitizeText(error.message || ''), ...context };
  if (error.stack) {
    props.stack = sanitizeText(error.stack);
  }
  fireAndForget(send(TrackType.ERROR, error.name || 'Error', props, options));
}

/**
 * 백엔드 에러 보고의 **단일 진입점**(3-layer error boundary 모델의 backend boundary).
 *
 * 어디서 에러가 났든 — ws-server 통합 catch, 전역 uncaughtException/unhandledRejection,
 * claude CLI 비동기 spawn/stream, webview(CLIENT_ERROR) / Kotlin(CLIENT_ERROR) 전달 — 모두
 * 이 함수 하나를 통해서만 trackError를 부른다. "에러 날 만한 개별 지점마다 trackError를 박는"
 * 방식을 없애고, 각 레이어 최상위로 전파된 에러를 한 곳에서 잡아 전송하기 위한 수렴점이다.
 *
 * 전송 자체(common fields / consent gating / fire-and-forget)는 trackError에 위임하며,
 * 이 함수는 호출 방식만 통일한다 — telemetry transport 로직은 건드리지 않는다.
 *
 * `context.origin`(backend / webview / kotlin)과 `context.layer`로 어느 바운더리에서
 * 잡혔는지를 항상 남긴다. 호출자는 await/then/catch 하지 않는다(fire-and-forget).
 */
export function reportBackendError(
  error: Error,
  context: TelemetryProperties = {},
): void {
  trackError(error, { origin: 'backend', ...context });
}
