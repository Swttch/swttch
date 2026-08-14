# @swttch/extend-kit

[English](README.md)

[Swttch](https://github.com/Swttch/swttch)가 필요로 하지만 플러그인 번들 안에 넣을 수 없어, 사용자 머신에 따로 설치되는 도구들의 모음입니다. 각 도구는 터미널에서든 라이브러리로든 단독으로 쓸 수 있으며, 플러그인은 그 사용자 중 하나일 뿐입니다.

| 도구 | 번들에 못 들어가는 이유 |
| --- | --- |
| **battery** | *사용자 본인의* 머신에 저장된 Claude Code 로그인 정보(keychain 또는 자격증명 파일)를 읽어야 합니다 |
| **stt** | 받아쓰기는 OAuth 토큰을 전송하는데, JetBrains 플러그인은 자격증명을 다룰 수 없습니다 |

## battery

Claude Code의 내부 API를 래핑한 TypeScript SDK 및 CLI입니다. Claude Code 사용자의 API 사용량 및 계정 정보를 프로그래매틱하게 접근할 수 있습니다.

> **`claude-code-battery`에서 옮겨오시나요?** import만 `@swttch/extend-kit`으로 바꾸면 나머지는 그대로입니다 — export 목록과 `ccb` 명령은 변경되지 않았습니다. 기존 패키지도 계속 동작하며, 이제 이 패키지를 재노출합니다.

## 주의사항

- **비공식 API**: 이 패키지는 Claude Code 클라이언트의 비공식 내부 API를 사용합니다. Anthropic에서 공식으로 지원하지 않으므로 향후 변경될 수 있습니다.
- **Claude Code 로그인 필수**: 이 SDK를 사용하려면 로컬 환경에 Claude Code가 설치되어 있고 로그인되어 있어야 합니다.
- **API Key 지원**: Anthropic API Key를 사용한 인증도 가능합니다. 다만 OAuth 전용 기능(`getUsage()`, `getProfile()`)은 API Key로는 사용할 수 없습니다.

## 설치

```bash
npm install @swttch/extend-kit
```

Node.js 버전 20 이상이 필요합니다.

## 빠른 시작

### SDK 사용

```typescript
import { ClaudeCodeClient } from '@swttch/extend-kit';

// 토큰 불필요 — 첫 API 호출 시 자동으로 크레덴셜을 읽어옵니다
const client = new ClaudeCodeClient();

const usage = await client.oauth.getUsage();
console.log(usage);

const profile = await client.oauth.getProfile();
console.log(profile);
```

토큰을 직접 전달할 수도 있습니다:

```typescript
// OAuth 접근 토큰 명시
const client = new ClaudeCodeClient(myOAuthAccessToken);
```

Anthropic API Key를 사용하려면:

```typescript
// Anthropic API Key 사용
const client = new ClaudeCodeClient({ apiKey: process.env.ANTHROPIC_API_KEY });
```

### CLI 사용

빌드 후 `ccb` 명령으로 사용할 수 있습니다.

```bash
# 빌드
npm run build

# 설치 (전역으로 사용하려면)
npm install -g .

# 사용량 조회
ccb oauth usage

# 프로필 조회
ccb oauth profile

# JSON 형식으로 출력
ccb oauth usage --json
```

## API 문서

### 인증 함수

#### `getCredentials(): Promise<ClaudeCredentials>`

Claude Code 저장소에서 크레덴셜을 읽습니다.

- **macOS**: Keychain에서 읽음
- **Windows/Linux**: `~/.claude/.credentials.json` 파일에서 읽음
- **커스터마이징**: `CLAUDE_CONFIG_DIR` 환경변수로 경로 지정 가능

```typescript
const credentials = await getCredentials();
```

#### `getAccessToken(credentials: ClaudeCredentials): string`

크레덴셜에서 접근 토큰을 추출합니다.

```typescript
const token = getAccessToken(credentials);
```

#### `isTokenExpired(credentials: ClaudeCredentials): boolean`

토큰이 만료되었는지 확인합니다.

```typescript
if (isTokenExpired(credentials)) {
  console.log('Token has expired');
}
```

### 인증 방식

| 방식 | 헤더 | 사용 사례 |
|------|------|----------|
| OAuth (자동) | `Authorization: Bearer {token}` | Claude Code 로그인 사용자 |
| OAuth (명시) | `Authorization: Bearer {token}` | 수동 OAuth 토큰 |
| API Key | `x-api-key: {key}` | Anthropic API 사용자 |

**참고**: OAuth 전용 기능(`getUsage()`, `getProfile()`)은 API Key 인증으로는 사용할 수 없습니다.

### ClaudeCodeClient

API 호출을 위한 클라이언트 클래스입니다. 서브모듈을 통해 API 엔드포인트에 접근합니다.

#### `constructor(auth?: string | { apiKey: string })`

OAuth 접근 토큰이나 API Key로 클라이언트를 초기화합니다. 인수를 전달하지 않으면 자동으로 크레덴셜을 읽어옵니다.

```typescript
// 자동으로 크레덴셜 읽어오기
const client = new ClaudeCodeClient();

// OAuth 토큰 명시
const client = new ClaudeCodeClient(myOAuthAccessToken);

// API Key
const client = new ClaudeCodeClient({ apiKey: process.env.ANTHROPIC_API_KEY });
```

#### `oauth: OAuthApi`

OAuth 관련 API를 제공하는 서브모듈입니다.

##### `oauth.getUsage(): Promise<UsageResponse>`

사용량 정보를 조회합니다. 5시간, 7일 버킷별 이용률 정보를 반환합니다.

```typescript
const usage = await client.oauth.getUsage();
// {
//   five_hour: { utilization: 45, resets_at: '2024-01-01T12:00:00Z' },
//   seven_day: { utilization: 62, resets_at: '2024-01-08T00:00:00Z' },
//   seven_day_opus: { utilization: 30, resets_at: '2024-01-08T00:00:00Z' },
//   seven_day_sonnet: { utilization: 55, resets_at: '2024-01-08T00:00:00Z' },
//   extra_usage: { is_enabled: true, monthly_limit: 1000, ... }
// }
```

##### `oauth.getProfile(): Promise<ProfileResponse>`

계정 및 조직 프로필 정보를 조회합니다.

```typescript
const profile = await client.oauth.getProfile();
// {
//   account: {
//     uuid: '...',
//     display_name: 'John Doe',
//     email: 'john@example.com',
//     has_claude_pro: true,
//     ...
//   },
//   organization: {
//     name: 'My Org',
//     organization_type: 'free',
//     subscription_status: 'active',
//     ...
//   },
//   application: { ... }
// }
```

### 에러 핸들링

SDK에서 발생하는 모든 에러는 `CcbError` 인스턴스이며, 기계가 읽을 수 있는 `code`와 선택적인 `hint`를 포함합니다.

```typescript
import { ClaudeCodeClient, CcbError } from '@swttch/extend-kit';

try {
  const usage = await client.oauth.getUsage();
} catch (err) {
  if (err instanceof CcbError) {
    console.log(err.code);    // 'unsupported_auth'
    console.log(err.hint);    // 'Check usage at console.anthropic.com, ...'
    console.log(err.toJSON()); // { error: { code, message, hint } }
  }
}
```

#### 에러 코드

| 코드 | 설명 | 힌트 |
|------|------|------|
| `unsupported_auth` | API Key는 이 작업을 지원하지 않음 | console.anthropic.com에서 사용량 확인 또는 OAuth 로그인 사용 |
| `credentials_not_found` | 크레덴셜 파일을 찾을 수 없음 | `claude login` 명령 실행으로 인증 |
| `token_expired` | OAuth 토큰이 만료됨 | `claude login` 명령 실행으로 토큰 갱신 |
| `api_error` | API 요청 실패 (HTTP 상태 포함) | — |
| `unsupported_platform` | 지원하지 않는 플랫폼 | — |

## 타입 정의

### 인증 타입

```typescript
interface ApiKeyAuth {
  apiKey: string;
}

type ClientAuth = string | ApiKeyAuth;
```

### UsageResponse

```typescript
interface UsageResponse {
  five_hour: UsageBucket | null;
  seven_day: UsageBucket | null;
  seven_day_oauth_apps: UsageBucket | null;
  seven_day_opus: UsageBucket | null;
  seven_day_sonnet: UsageBucket | null;
  seven_day_cowork: UsageBucket | null;
  extra_usage: ExtraUsage | null;
}
```

### UsageBucket

```typescript
interface UsageBucket {
  utilization: number;      // 0-100 %
  resets_at: string | null; // ISO 8601 형식의 리셋 시간
}
```

### ExtraUsage

```typescript
interface ExtraUsage {
  is_enabled: boolean;
  monthly_limit: number | null;
  used_credits: number | null;
  utilization: number | null;
}
```

### ProfileResponse

```typescript
interface ProfileResponse {
  account: AccountInfo;
  organization: OrganizationInfo;
  application: ApplicationInfo;
}
```

### AccountInfo

```typescript
interface AccountInfo {
  uuid: string;
  full_name: string;
  display_name: string;
  email: string;
  has_claude_max: boolean;
  has_claude_pro: boolean;
  created_at: string;
}
```

### OrganizationInfo

```typescript
interface OrganizationInfo {
  uuid: string;
  name: string;
  organization_type: string;
  billing_type: string;
  rate_limit_tier: string;
  has_extra_usage_enabled: boolean;
  subscription_status: string;
  subscription_created_at: string;
}
```

### ApplicationInfo

```typescript
interface ApplicationInfo {
  uuid: string;
  name: string;
  slug: string;
}
```

### ClaudeCredentials

```typescript
interface ClaudeCredentials {
  claudeAiOauth: ClaudeOAuthCredentials;
  organizationUuid: string;
}

interface ClaudeOAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  subscriptionType: string;
  rateLimitTier: string;
}
```

## CLI 명령어

### usage

사용량 제한 정보를 조회합니다.

```bash
ccb oauth usage

# 출력 예:
# Usage:
#   five hour: 45%
#   seven day: 62% (resets 2024-01-08T00:00:00)
#   seven day opus: 30% (resets 2024-01-08T00:00:00)
#   seven day sonnet: 55% (resets 2024-01-08T00:00:00)
#   extra usage: enabled
```

### profile

계정 및 조직 프로필을 조회합니다.

```bash
ccb oauth profile

# 출력 예:
# Profile:
#   name: John Doe
#   email: john@example.com
#   plan: free
#   org: My Organization
#   status: active
```

### 옵션

- `--json`: JSON 형식으로 출력
- `-h, --help`: 도움말 표시
- `-v, --version`: 버전 정보 표시

```bash
ccb oauth usage --json
ccb oauth profile --json
ccb --version
ccb --help
```

### 에러 출력

에러 출력도 `--json` 플래그를 따릅니다:

```bash
$ ccb oauth usage
Error: API Key authentication does not support usage/profile queries.
Hint: Check usage at console.anthropic.com, or use OAuth login (claude login)
```

```bash
$ ccb oauth usage --json
{
  "error": {
    "code": "unsupported_auth",
    "message": "API Key authentication does not support usage/profile queries.",
    "hint": "Check usage at console.anthropic.com, or use OAuth login (claude login)"
  }
}
```

## stt

다른 Claude Code 클라이언트들이 쓰는 것과 동일한 음성 서비스로 실시간 받아쓰기를 합니다. 이 머신에 이미 있는 Claude Code 로그인(`battery`가 읽는 그 로그인)으로 인증하므로, 별도의 API 키도 별도의 과금도 없습니다.

```typescript
import { stt } from '@swttch/extend-kit';

const stream = await stt.openSpeechToTextStream({
  onTranscript: (text, isFinal) => {
    // isFinal false → 곧 교체될 추정값입니다. 보여주되 쌓아두지 마세요.
    // isFinal true  → 확정된 텍스트입니다. 이어붙이세요.
    if (isFinal) console.log(text);
  },
  onError: (message, info) => {
    // info.fatal 이면 재시도해도 소용없습니다(예: 토큰이 거부됨).
    console.error(message);
  },
});

// 16비트 PCM, 16kHz, 모노를 그대로 넣습니다. 소켓이 열리기 전에 보낸 오디오는
// 버퍼링되므로, 곧바로 녹음을 시작해도 앞부분이 잘리지 않습니다.
stream.sendAudio(pcmChunk);

// 닫을 때 마지막 발화를 잠시 기다린 뒤 종료합니다.
await stream.close();
```

### 오디오 형식

서비스는 한 가지 형식만 받으며, 다른 것을 보내면 에러가 아니라 **무음으로 처리**됩니다.

| | |
| --- | --- |
| 인코딩 | `linear16` (부호 있는 16비트 PCM, 리틀 엔디언) |
| 샘플레이트 | 16000 Hz |
| 채널 | 1 (모노) |

런타임에 이 값이 필요하면 `stt.AUDIO_FORMAT`에 들어 있습니다.

### 옵션

```typescript
await stt.openSpeechToTextStream(handlers, {
  language: 'ko',                       // BCP-47. 기본값은 'en'
  extraKeyterms: ['Swttch', 'JCEF'],    // 사용하는 어휘 쪽으로 인식을 유도
  typedInterims: true,                  // 확정 전 추정값도 함께 스트리밍
});
```

일반 음성 모델은 기술 용어를 잘못 알아듣습니다("MCP"를 "MTP"로). 기본 프로그래밍 용어 목록이 항상 적용되며, `extraKeyterms`는 거기에 추가됩니다.

### 사용 가능 여부 먼저 확인하기

```typescript
if (!(await stt.isSpeechToTextAvailable())) {
  // 이 머신에 Claude Code가 로그인되어 있지 않습니다.
}
```

> **참고**: 이 엔드포인트는 Anthropic이 문서화한 API가 아닙니다. 예고 없이 바뀔 수 있습니다. 클라이언트는 모르는 메시지 타입을 실패로 처리하지 않고 무시하지만, 더 큰 변경이 생기면 받아쓰기가 깨질 수 있습니다.

## 개발

### 설치

```bash
npm install
```

### 빌드

```bash
npm run build
```

TypeScript를 JavaScript로 컴파일합니다. 결과물은 `dist/` 디렉토리에 저장됩니다.

### Watch 모드

```bash
npm run dev
```

파일 변경을 감지하여 자동으로 컴파일합니다.

### 타입 검사

```bash
npm run lint
```

TypeScript 타입 검사를 실행합니다.

### 테스트

```bash
npm test
```

`dist/**/*.test.js` 파일을 실행합니다.

## 라이선스

MIT

## 작성자

yhk1038
