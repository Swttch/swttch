import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── Settings helpers ────────────────────────────────────────────────────────

const SETTINGS_FILE = join(homedir(), '.claude-code-gui', 'settings.js');

const DEFAULT_SETTINGS: Record<string, unknown> = {
  cliPath: null,
  nodePath: null,
  theme: 'system',
  fontSize: 13,
  lineHeight: 1.6,
  autoScrollThreshold: 80,
  debugMode: false,
  logLevel: 'info',
  terminalApp: null,
  openFilesWith: null,
  openFilesWithCustom: null,
  hostMode: 'editor-tab',
  openSettingsAs: 'overlay',
  chatPagination: true,
  uiDirection: 'ltr',
  // GUI-only keys migrated out of the native ~/.claude/settings.json (not part of
  // Claude Code's official settings schema). See settings-migration.ts.
  uiLanguage: null,
  useCtrlEnterToSend: false,
  focusInputOnEditorContext: true,
  autoResumeOnLimit: false,
  ultracode: null,
  // Only CLAUDE_CONFIG_DIR lives here: it decides where the native settings file
  // is, so it cannot be stored inside that file. Every other variable belongs to
  // the native `env` key. See settings-migration.ts.
  env: {},
  // ── Legacy keys kept ONLY so the migration can clear them ───────────────────
  // They moved to the native file (language, respectGitignore). Removing them
  // from this map would make validateSetting reject the write that empties them,
  // stranding the old value here forever. Drop them once the migration retires.
  language: null,
  respectGitignoreForContext: false,
};

const COMMENT_MAP: Record<string, string> = {
  cliPath: 'Claude CLI 실행 파일 경로 (null이면 자동 감지)',
  nodePath: 'Node.js 실행 파일 경로 (null이면 자동 감지, 변경 시 재시작 필요)',
  theme: '테마: "system" | "light" | "dark"',
  fontSize: '글꼴 크기 (8~32)',
  lineHeight: '채팅 메시지 줄 간격(line-height 배수, 0.5~10)',
  autoScrollThreshold: '자동 스크롤 임계점(px). 메시지 끝에서 이 거리 안에 있을 때만 스트림을 따라 내려간다',
  debugMode: '디버그 모드 활성화',
  logLevel: '로그 레벨: "debug" | "info" | "warn" | "error"',
  terminalApp: '터미널 프로그램 (null이면 OS 기본 터미널)',
  openFilesWith: '파일을 열 프로그램 (null이면 OS 기본, "$custom"이면 openFilesWithCustom 사용)',
  openFilesWithCustom: '사용자 지정 파일 열기 프로그램: { path, arguments } (arguments의 %TARGET_PATH%가 파일 경로로 치환)',
  hostMode: '채팅을 띄우는 자리: "editor-tab" | "tool-window"',
  openSettingsAs: '설정 화면을 여는 방식: "overlay" | "new-tab"',
  chatPagination: '채팅 기록을 페이지 단위로 로드(스크롤 시 이전 메시지 추가). false면 전체를 한 번에 로드',
  uiDirection: 'UI 미러링(레이아웃 방향): "ltr" | "rtl"',
  uiLanguage: 'GUI 인터페이스 표시 언어(예: "korean"). null이면 영어. Claude 응답 언어(language)와 무관',
  useCtrlEnterToSend: 'true면 Ctrl/Cmd+Enter로 전송하고 Enter는 줄바꿈. false면 Enter로 전송',
  focusInputOnEditorContext: 'true면 Alt+K로 파일 경로 삽입 후 채팅 입력창으로 포커스 이동',
  autoResumeOnLimit: '사용량 리밋 리셋 시 자동 재개(후원자 전용). 기본 off. 리밋 배너의 기본 동작을 seed',
  ultracode: 'Effort 슬라이더 최상단 단계(xhigh + workflows 묶음). null이면 off',
  env: 'CLAUDE_CONFIG_DIR 전용. 다른 환경 변수는 네이티브 settings.json의 env에 둔다',
  language: '[레거시] 네이티브 settings.json으로 이관됨. 마이그레이션이 비우는 용도로만 남김',
  respectGitignoreForContext: '[레거시] 네이티브 respectGitignore로 이관됨. 마이그레이션이 비우는 용도로만 남김',
};

function generateSettingsContent(settings: Record<string, unknown>): string {
  const lines: string[] = ['export default {'];
  const keys = Object.keys(DEFAULT_SETTINGS);
  for (const key of keys) {
    const value = key in settings ? settings[key] : DEFAULT_SETTINGS[key];
    const comment = COMMENT_MAP[key];
    if (comment) {
      lines.push(`  // ${comment}`);
    }
    const serialized = value === null ? 'null' : JSON.stringify(value);
    lines.push(`  ${key}: ${serialized},`);
  }
  lines.push('};');
  return lines.join('\n') + '\n';
}

export async function readSettingsFile(): Promise<Record<string, unknown>> {
  try {
    if (!existsSync(SETTINGS_FILE)) {
      // Create with defaults
      await mkdir(join(homedir(), '.claude-code-gui'), { recursive: true });
      await writeFile(SETTINGS_FILE, generateSettingsContent(DEFAULT_SETTINGS), 'utf-8');
      return { ...DEFAULT_SETTINGS };
    }

    const raw = await readFile(SETTINGS_FILE, 'utf-8');

    // Strip block comments
    let stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '');

    // Strip line comments (preserving strings)
    stripped = stripped.replace(/\/\/[^\n]*/g, '');

    // Remove `export default` prefix and trailing semicolon
    stripped = stripped.replace(/^\s*export\s+default\s*/, '').replace(/;\s*$/, '').trim();

    // Add quotes to unquoted keys: word chars followed by colon
    stripped = stripped.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');

    // Remove trailing commas before closing braces/brackets
    stripped = stripped.replace(/,\s*([\]}])/g, '$1');

    const parsed = JSON.parse(stripped) as Record<string, unknown>;

    // Merge with defaults so missing keys get default values
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    console.error('[node-backend]', 'Failed to read settings file, using defaults:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

export interface SaveResult {
  status: 'ok' | 'error';
  error?: string;
}

function validateSetting(key: string, value: unknown): string | null {
  if (!(key in DEFAULT_SETTINGS)) {
    return `Unknown settings key: ${key}`;
  }
  switch (key) {
    case 'theme':
      if (!['system', 'light', 'dark'].includes(value as string)) {
        return 'theme must be one of "system", "light", "dark"';
      }
      break;
    case 'fontSize': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 8 || n > 32) {
        return 'fontSize must be an integer between 8 and 32';
      }
      break;
    }
    case 'lineHeight': {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0.5 || n > 10) {
        return 'lineHeight must be a number between 0.5 and 10';
      }
      break;
    }
    case 'autoScrollThreshold': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) {
        return 'autoScrollThreshold must be a positive integer';
      }
      break;
    }
    case 'debugMode':
      if (typeof value !== 'boolean') {
        return `${key} must be a boolean`;
      }
      break;
    case 'logLevel':
      if (!['debug', 'info', 'warn', 'error'].includes(value as string)) {
        return 'logLevel must be one of "debug", "info", "warn", "error"';
      }
      break;
    case 'cliPath':
      if (value !== null && typeof value !== 'string') {
        return 'cliPath must be a string or null';
      }
      break;
    case 'nodePath':
      if (value !== null && typeof value !== 'string') {
        return 'nodePath must be a string or null';
      }
      break;
    case 'terminalApp':
      if (value !== null && typeof value !== 'string') {
        return 'terminalApp must be a string or null';
      }
      break;
    case 'openFilesWith':
      if (value !== null && typeof value !== 'string') {
        return 'openFilesWith must be a string or null';
      }
      break;
    case 'openFilesWithCustom': {
      if (value !== null) {
        if (typeof value !== 'object' || Array.isArray(value)) {
          return 'openFilesWithCustom must be an object or null';
        }
        const custom = value as Record<string, unknown>;
        if (typeof custom.path !== 'string' || typeof custom.arguments !== 'string') {
          return 'openFilesWithCustom must have string "path" and "arguments"';
        }
      }
      break;
    }
    case 'hostMode':
      if (!['editor-tab', 'tool-window'].includes(value as string)) {
        return 'hostMode must be one of "editor-tab", "tool-window"';
      }
      break;
    case 'openSettingsAs':
      if (!['overlay', 'new-tab'].includes(value as string)) {
        return 'openSettingsAs must be one of "overlay", "new-tab"';
      }
      break;
    case 'chatPagination':
      if (typeof value !== 'boolean') {
        return `${key} must be a boolean`;
      }
      break;
    case 'uiDirection':
      if (!['ltr', 'rtl'].includes(value as string)) {
        return 'uiDirection must be one of "ltr", "rtl"';
      }
      break;
    case 'uiLanguage':
      if (value !== null && typeof value !== 'string') {
        return 'uiLanguage must be a string or null';
      }
      break;
    // Legacy: kept so the migration can clear it (null) after moving the value
    // to the native file.
    case 'language':
      if (value !== null && typeof value !== 'string') {
        return 'language must be a string or null';
      }
      break;
    case 'useCtrlEnterToSend':
    case 'focusInputOnEditorContext':
    case 'autoResumeOnLimit':
      if (typeof value !== 'boolean') {
        return `${key} must be a boolean`;
      }
      break;
    // null = off/cleared, mirroring how the effort slider clears the top step.
    case 'ultracode':
      if (value !== null && typeof value !== 'boolean') {
        return 'ultracode must be a boolean or null';
      }
      break;
    // Legacy: null clears it once the value has moved to native respectGitignore.
    case 'respectGitignoreForContext':
      if (value !== null && typeof value !== 'boolean') {
        return 'respectGitignoreForContext must be a boolean or null';
      }
      break;
    case 'env': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return 'env must be an object of string values';
      }
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v !== 'string') {
          return `env.${k} must be a string`;
        }
      }
      break;
    }
  }
  return null;
}

/** Coerce an unknown settings value into a string-keyed env record (or {}). */
function asEnvRecord(value: unknown): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, string>;
  }
  return {};
}

/**
 * Read project-level app settings.
 * Project settings use JSON format: {projectPath}/.claude-code-gui/settings.json
 */
export async function readProjectSettings(projectPath: string): Promise<Record<string, unknown>> {
  const filePath = join(projectPath, '.claude-code-gui', 'settings.json');
  try {
    if (!existsSync(filePath)) return {};
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    console.error('[node-backend]', 'Failed to read project settings:', err);
    return {};
  }
}

/**
 * Read merged settings: DEFAULT → global → project
 */
export async function readMergedSettings(projectPath?: string): Promise<{ settings: Record<string, unknown>; overrides: string[] }> {
  const globalSettings = await readSettingsFile();
  if (!projectPath) {
    return { settings: globalSettings, overrides: [] };
  }
  const projectSettings = await readProjectSettings(projectPath);
  const overrides = Object.keys(projectSettings);
  const merged: Record<string, unknown> = { ...globalSettings, ...projectSettings };
  // env is the one nested key we merge by sub-key (Claude's own order: global env,
  // then project env overriding individual keys) rather than replacing wholesale —
  // otherwise a project that sets one var would wipe the user's global vars.
  merged.env = { ...asEnvRecord(globalSettings.env), ...asEnvRecord(projectSettings.env) };
  return { settings: merged, overrides };
}

/**
 * Resolve the effective CLAUDE_CONFIG_DIR override declared in the plugin settings
 * `env` map (project takes priority over global). Returns null when unset, so callers
 * can fall back to process.env / the default ~/.claude.
 */
export async function resolveClaudeConfigDirOverride(projectPath?: string): Promise<string | null> {
  const { settings } = await readMergedSettings(projectPath);
  const value = asEnvRecord(settings.env).CLAUDE_CONFIG_DIR;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Set or remove a single variable inside the `env` map at the given scope, preserving
 * the other variables. Passing value === null removes the variable.
 */
export async function saveEnvVarToScope(
  name: string,
  value: string | null,
  scope: 'global' | 'project',
  projectPath?: string,
): Promise<SaveResult> {
  if (scope === 'project' && !projectPath) {
    return { status: 'error', error: 'projectPath required for project scope' };
  }

  const source = scope === 'project'
    ? await readProjectSettings(projectPath as string)
    : await readSettingsFile();
  const currentEnv = { ...asEnvRecord(source.env) };

  if (value === null) {
    delete currentEnv[name];
  } else {
    currentEnv[name] = value;
  }

  return saveSettingToScope('env', currentEnv, scope, projectPath);
}

/**
 * Save a setting to the specified scope.
 * For project scope, saves to {projectPath}/.claude-code-gui/settings.json
 */
export async function saveSettingToScope(
  key: string,
  value: unknown,
  scope: 'global' | 'project',
  projectPath?: string,
): Promise<SaveResult> {
  if (scope === 'project') {
    if (!projectPath) return { status: 'error', error: 'projectPath required for project scope' };
    const validationError = validateSetting(key, value);
    if (validationError) return { status: 'error', error: validationError };

    try {
      const filePath = join(projectPath, '.claude-code-gui', 'settings.json');
      let current: Record<string, unknown> = {};
      try {
        if (existsSync(filePath)) {
          current = JSON.parse(await readFile(filePath, 'utf-8')) as Record<string, unknown>;
        }
      } catch { /* start fresh */ }
      current[key] = value;
      await mkdir(join(projectPath, '.claude-code-gui'), { recursive: true });
      await writeFile(filePath, JSON.stringify(current, null, 2) + '\n', 'utf-8');
      return { status: 'ok' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 'error', error: msg };
    }
  }
  // global scope: use existing saveSettingToFile
  return saveSettingToFile(key, value);
}

/**
 * Serializes global settings writes. Concurrent updateSetting calls used to
 * interleave their read-modify-write of settings.js — a shorter new write left
 * a tail of the previous content, corrupting the file. Chaining guarantees one
 * read-modify-write completes before the next begins.
 */
let settingsWriteChain: Promise<unknown> = Promise.resolve();

/** Write via a temp file + atomic rename so a partial write can never be observed. */
async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tmp = `${filePath}.tmp-${process.pid}`;
  await writeFile(tmp, content, 'utf-8');
  await rename(tmp, filePath);
}

export function saveSettingToFile(key: string, value: unknown): Promise<SaveResult> {
  const run = settingsWriteChain.then(() => doSaveSettingToFile(key, value));
  // Keep the chain alive even if a write fails.
  settingsWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function doSaveSettingToFile(key: string, value: unknown): Promise<SaveResult> {
  const validationError = validateSetting(key, value);
  if (validationError) {
    return { status: 'error', error: validationError };
  }

  try {
    const current = await readSettingsFile();
    current[key] = value;
    await mkdir(join(homedir(), '.claude-code-gui'), { recursive: true });
    await atomicWriteFile(SETTINGS_FILE, generateSettingsContent(current));
    return { status: 'ok' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', 'Failed to save setting:', err);
    return { status: 'error', error: msg };
  }
}
