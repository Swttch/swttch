# @swttch/extend-kit

[한국어](README.ko.md)

The companion tools [Swttch](https://github.com/Swttch/swttch) needs but cannot ship inside the plugin bundle, so they install on your machine instead. Each one is usable on its own — from a terminal or as a library — and the plugin is simply one caller among others.

| Tool | Why it lives outside the bundle |
| --- | --- |
| **battery** | Reads the Claude Code login stored on *your* machine (keychain, or a credentials file) |
| **stt** | Dictation sends your OAuth token, and a JetBrains plugin may not handle credentials |

## battery

A TypeScript SDK and CLI that wraps the internal API of Claude Code. This allows programmatic access to API usage metrics and account information for Claude Code users.

> **Moving from `claude-code-battery`?** Change the import to `@swttch/extend-kit` and everything else stays the same — the exports and the `ccb` command are unchanged. The old package still works; it now re-exports this one.

## Important Notes

- **Unofficial API**: This package uses the unofficial internal API of the Claude Code client. Anthropic does not officially support it, so it may change in the future.
- **Claude Code Login Required**: To use this SDK, you must have Claude Code installed and logged in on your local machine.
- **API Key Support**: You can also authenticate using Anthropic API Key. However, some OAuth-exclusive features (`getUsage()`, `getProfile()`) are not available with API Key authentication.

## Installation

```bash
npm install @swttch/extend-kit
```

Node.js version 20 or higher is required.

## Quick Start

### SDK Usage

```typescript
import { ClaudeCodeClient } from '@swttch/extend-kit';

// No token needed — credentials are resolved automatically on first API call
const client = new ClaudeCodeClient();

const usage = await client.oauth.getUsage();
console.log(usage);

const profile = await client.oauth.getProfile();
console.log(profile);
```

You can also pass a token explicitly if needed:

```typescript
// With OAuth access token explicitly
const client = new ClaudeCodeClient(myOAuthAccessToken);
```

If you prefer using Anthropic API Key:

```typescript
// With Anthropic API Key
const client = new ClaudeCodeClient({ apiKey: process.env.ANTHROPIC_API_KEY });
```

### CLI Usage

After building, you can use the `ccb` command.

```bash
# Build
npm run build

# Install globally (optional)
npm install -g .

# Get usage information
ccb oauth usage

# Get profile information
ccb oauth profile

# Output in JSON format
ccb oauth usage --json
```

## API Documentation

### Authentication Functions

#### `getCredentials(): Promise<ClaudeCredentials>`

Reads credentials from the Claude Code storage.

- **macOS**: Reads from Keychain
- **Windows/Linux**: Reads from `~/.claude/.credentials.json` file
- **Customization**: Specify path with `CLAUDE_CONFIG_DIR` environment variable

```typescript
const credentials = await getCredentials();
```

#### `getAccessToken(credentials: ClaudeCredentials): string`

Extracts the access token from credentials.

```typescript
const token = getAccessToken(credentials);
```

#### `isTokenExpired(credentials: ClaudeCredentials): boolean`

Checks if the token has expired.

```typescript
if (isTokenExpired(credentials)) {
  console.log('Token has expired');
}
```

### Authentication Methods

| Method | Header | Use Case |
|--------|--------|----------|
| OAuth (auto) | `Authorization: Bearer {token}` | Claude Code logged-in users |
| OAuth (explicit) | `Authorization: Bearer {token}` | Manual OAuth token |
| API Key | `x-api-key: {key}` | Anthropic API users |

**Note**: OAuth-exclusive features (`getUsage()`, `getProfile()`) are not available with API Key authentication.

### ClaudeCodeClient

A client class for making API calls. Access API endpoints through sub-modules.

#### `constructor(auth?: string | { apiKey: string })`

Initializes the client with OAuth access token or API Key. If no argument is provided, credentials are resolved automatically.

```typescript
// Auto-resolve credentials
const client = new ClaudeCodeClient();

// Explicit OAuth token
const client = new ClaudeCodeClient(myAccessToken);

// API Key
const client = new ClaudeCodeClient({ apiKey: process.env.ANTHROPIC_API_KEY });
```

#### `oauth: OAuthApi`

A sub-module that provides OAuth-related API methods.

##### `oauth.getUsage(): Promise<UsageResponse>`

Retrieves usage information. Returns utilization data for 5-hour and 7-day buckets.

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

Retrieves account and organization profile information.

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

### Error Handling

All errors thrown by the SDK are instances of `CcbError`, which includes a machine-readable `code` and optional `hint`.

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

#### Error Codes

| Code | Description | Hint |
|------|-------------|------|
| `unsupported_auth` | API Key does not support this operation | Check usage at console.anthropic.com, or use OAuth login |
| `credentials_not_found` | Credentials file not found | Run `claude login` to authenticate |
| `token_expired` | OAuth token has expired | Run `claude login` to refresh your token |
| `api_error` | API request failed (includes HTTP status) | — |
| `unsupported_platform` | Platform not supported | — |

## Type Definitions

### Authentication Types

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
  utilization: number;      // 0-100%
  resets_at: string | null; // ISO 8601 format reset time
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

## CLI Commands

### usage

Retrieves usage limit information.

```bash
ccb oauth usage

# Output example:
# Usage:
#   five hour: 45%
#   seven day: 62% (resets 2024-01-08T00:00:00)
#   seven day opus: 30% (resets 2024-01-08T00:00:00)
#   seven day sonnet: 55% (resets 2024-01-08T00:00:00)
#   extra usage: enabled
```

### profile

Retrieves account and organization profile.

```bash
ccb oauth profile

# Output example:
# Profile:
#   name: John Doe
#   email: john@example.com
#   plan: free
#   org: My Organization
#   status: active
```

### Options

- `--json`: Output in JSON format
- `-h, --help`: Show help
- `-v, --version`: Show version information

```bash
ccb oauth usage --json
ccb oauth profile --json
ccb --version
ccb --help
```

### Error Output

Errors respect the `--json` flag:

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

Live dictation against the same speech service the other Claude Code clients use. It authenticates with the Claude Code login already on this machine — the same one `battery` reads — so there is no separate API key and no separate bill.

```typescript
import { stt } from '@swttch/extend-kit';

const stream = await stt.openSpeechToTextStream({
  onTranscript: (text, isFinal) => {
    // isFinal false → a live guess that will be replaced; show it, don't keep it.
    // isFinal true  → settled text; append it.
    if (isFinal) console.log(text);
  },
  onError: (message, info) => {
    // info.fatal means retrying won't help (e.g. the token was rejected).
    console.error(message);
  },
});

// Feed raw 16-bit PCM, 16 kHz, mono. Audio sent before the socket finishes
// opening is buffered, so you can start recording immediately.
stream.sendAudio(pcmChunk);

// Closing waits briefly for the last words, then resolves.
await stream.close();
```

### Audio format

The service accepts one format, and sending anything else yields silence rather than an error:

| | |
| --- | --- |
| Encoding | `linear16` (raw signed 16-bit PCM, little-endian) |
| Sample rate | 16000 Hz |
| Channels | 1 (mono) |

`stt.AUDIO_FORMAT` carries these values if you need them at runtime.

### Options

```typescript
await stt.openSpeechToTextStream(handlers, {
  language: 'ko',                       // BCP-47; defaults to 'en'
  extraKeyterms: ['Swttch', 'JCEF'],    // bias recognition toward your vocabulary
  typedInterims: true,                  // also stream partial guesses
});
```

A general speech model mishears technical words — "MCP" becomes "MTP". A default set of programming terms is always applied; `extraKeyterms` adds to it.

### Checking availability first

```typescript
if (!(await stt.isSpeechToTextAvailable())) {
  // Claude Code is not logged in on this machine.
}
```

> **Note**: this endpoint is not part of Anthropic's documented API. It may change without warning. The client ignores message types it does not recognise rather than failing, but a larger change could still break dictation.

## Development

### Installation

```bash
npm install
```

### Build

```bash
npm run build
```

Compiles TypeScript to JavaScript. Output is saved in the `dist/` directory.

### Watch Mode

```bash
npm run dev
```

Automatically compiles on file changes.

### Type Checking

```bash
npm run lint
```

Runs TypeScript type checking.

### Testing

```bash
npm test
```

Runs test files in `dist/**/*.test.js`.

## License

MIT

## Author

yhk1038
