import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// ── Rybbit 텔레메트리 설정 ──────────────────────────────
// HOST/SITE_ID는 비밀이 아니다 — 브라우저 추적 스크립트에도 그대로 노출되는
// 공개 식별자라 소스 상수로 둔다. API 키만 비밀이라 빌드 타임에 박제한다.
export const RYBBIT_HOST = 'https://ccg-telemetry.01republic.io';
export const RYBBIT_SITE_ID = '2a8b407c8941';
// 빌드 타임 박제 (.env의 `_` prefix 키): `_`로 시작하는 .env 키만 빌드 시
// esbuild define으로 번들에 리터럴 값으로 박힌다(런타임 process.env가 아니라
// 빌드 산출물에 치환). 언더스코어를 뗀 이름으로 export한다. esbuild가 치환하려면
// 반드시 `process.env._KEY`를 정적으로 직접 참조해야 한다(구조분해/동적 접근 X).
export const CCG_RYBBIT_API_KEY = process.env._CCG_RYBBIT_API_KEY ?? '';

// ── 빌드 환경 ──────────────────────────────────────────
export const isDev = () => process.env.NODE_ENV !== 'production';
export const isProd = () => process.env.NODE_ENV === 'production';

// ── 실행 환경 (런타임 주입) ─────────────────────────────
// 실행 주체(JetBrains=Kotlin spawn, standalone=ccg)가 주입한다. 이 키들은
// .env에 넣지 않는다 — `_`를 붙여 빌드 박제로 만들면 런타임 주입이 무력화된다.
export const isJetBrainsMode = process.env.JETBRAINS_MODE === 'true';
export const ccgClientInfo = process.env.CCG_CLIENT_INFO ?? '';
export const projectRoot = process.env.CCG_PROJECT_ROOT?.trim() || undefined;

// ── 공지(Server-Driven Announcements) 배포 엔드포인트 ────────
// 공지 목록을 내려주는 원격 엔드포인트 base URL. 텔레메트리와 달리 빌드 타임 박제
// 대상이 아니다(비밀이 아닌 설정값이라 런타임 주입으로 충분). 미설정이면
// features/announcements.ts가 fetch 자체를 생략하고 빈 목록을 반환한다(graceful).
export const announcementsUrl = process.env.CCG_ANNOUNCE_URL?.trim() || undefined;

// ── 개발/실측용: idle shutdown 비활성화 ─────────────────
// standalone(`pnpm dev`)으로 직접 띄운 백엔드는 클라이언트가 잠깐 끊기면 idle
// shutdown으로 종료되는데, launcher(JetBrains/ccg)와 달리 respawn 주체가 없어
// 그대로 죽어버린다. 브라우저로 반복 실측하는 동안 백엔드를 계속 살려두기 위한
// 개발 전용 스위치. 배포 경로에는 영향 없다(설정하지 않으면 기존 동작 유지).
export const disableIdleShutdown = process.env.CCG_DISABLE_IDLE_SHUTDOWN === 'true';

// ── 서버 설정 ──────────────────────────────────────────
const DEFAULT_PORT = 19836;
export const serverPort = parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);

// ── 서버 바인딩 host ────────────────────────────────────
// 기본은 loopback(127.0.0.1) — 외부 네트워크에 노출되지 않는다. 실행 주체(ccg
// `run -b <addr>` / JetBrains / 기타 wrapper)가 CCG_BIND 환경변수로 주소를 주입하면
// 그 주소로 바인딩한다. PORT처럼 흔한 `HOST` 이름은 무관한 셸 환경변수와 충돌할 수
// 있어 CCG_* 접두 관습을 따른다. 비-loopback 바인딩은 LAN 노출을 뜻하므로, 그 경우
// ws-server가 strict same-origin 완화를 함께 켠다(ws-server.ts::startWebSocketServer).
const DEFAULT_HOST = '127.0.0.1';
export const serverHost = process.env.CCG_BIND?.trim() || DEFAULT_HOST;

// ── 제어 채널 인증 토큰 ───────────────────────────────────
// /ws · /rpc · /logs 제어 채널과 /internal/* 푸시를 인증하는 인증 토큰.
// 인증이 없으면 포트에 닿는 임의 클라이언트가 bypass 권한으로 Claude 세션을
// 시작할 수 있어 RCE가 된다(제보 배경).
//
// 소유권(중요): 이제 토큰은 **런처(Kotlin 플러그인 / ccg CLI)가 소유하는 STABLE
// per-machine 토큰**이다. 런처가 디스크에 영속화한 비밀(→ HMAC 파생)로 안정적인
// 토큰을 만들어 CCG_AUTH_TOKEN env로 백엔드에 주입한다. 백엔드는 그 값을 그대로
// 소비할 뿐, 비밀을 디스크에서 읽거나 생성하지 않는다(디스크-비밀 로직은 런처의 몫).
// 프로덕션(JetBrains/ccg)에서는 런처가 항상 CCG_AUTH_TOKEN을 주입하므로 아래
// randomBytes 분기는 어떤 부트스트랩도 토큰을 주지 못했을 때의 안전 폴백일 뿐이다.
// serverHost와 동일하게 모듈 로드 시 1회 평가되는 상수라 프로세스 수명 내내 같은
// 값이 쓰인다. 주의: 이 값은 절대 로그로 출력하지 않는다.
//
// dev 편의(footgun 없이): 로컬 Vite 개발에서는 부트스트랩(Kotlin/foreground.sh)이
// 없어 CCG_AUTH_TOKEN이 주입되지 않는다. 이때 dev에 한해 고정 dev 토큰을 기본값으로
// 써서 webview(import.meta.env.VITE_CCG_DEV_TOKEN 미설정 시 동일 상수)와 짝이 맞게
// 한다. 이 고정값은 의도적으로 안전하지 않은 개발 전용 값이며, 프로덕션(dev 신호 없음)
// 에서는 절대 쓰이지 않고 랜덤 토큰으로 폴백한다. dev 신호는 isDev()(NODE_ENV)로 판정
// 하며, 배포 번들(backend.mjs)은 esbuild가 NODE_ENV='production'을 박제하므로
// 프로덕션에서 isDev()는 확실히 false다(backend/esbuild.mjs 참조). webview 연결 빌더가
// 이 토큰을 Sec-WebSocket-Protocol 헤더(`['ccg-auth', token]`)로 부착한다.
const DEV_INSECURE_AUTH_TOKEN = 'ccg-dev-insecure-token';
export const authToken = process.env.CCG_AUTH_TOKEN?.trim()
  || (isDev() ? DEV_INSECURE_AUTH_TOKEN : randomBytes(32).toString('hex'));

// ── 재기동 신호 ─────────────────────────────────────────
// "플러그인 재기동"의 통일 신호. 프론트엔드 실행환경(브라우저 환경/JetBrains)이나
// 백엔드 관리 주체(Kotlin/ccg)와 무관하게, Node가 이 종료코드로 스스로 exit하면
// 그 Node를 spawn한 관리 주체가 같은 포트로 respawn한다. 분기 없는 단일 규칙.
//   - JetBrains: NodeProcessManager가 proc.waitFor()==이 값을 감지해 BackendInstance.restart()
//   - ccg standalone: cli/lib/spawn/foreground.sh가 wait 종료코드==이 값에서 respawn
//   - dev(be-dev, `node --watch`): self-exit는 자동 재시작하지 않으므로(파일 변경 시에만
//     재시작) 재기동은 best-effort다 — 개발 전용 한계이며 고객 경로(JetBrains/ccg)는 무관.
// 이 값을 바꾸면 cli/lib/spawn/foreground.sh의 동일 리터럴도 함께 바꿔야 한다.
export const RESTART_EXIT_CODE = 75;

function resolveWebviewDir(): string | undefined {
  if (process.env.WEBVIEW_DIR) return process.env.WEBVIEW_DIR;
  if (isJetBrainsMode) return undefined;

  // Browser 모드: backend/dist/backend.mjs 기준 ../../webview/dist
  const currentFile = fileURLToPath(import.meta.url);
  // backend/dist/backend.mjs → ../../webview/dist (루트 기준)
  const candidate = resolve(currentFile, '..', '..', '..', 'webview', 'dist');
  return existsSync(resolve(candidate, 'index.html')) ? candidate : undefined;
}

export const webviewDir = resolveWebviewDir();
