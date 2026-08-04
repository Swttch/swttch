// ============================================
// Chat Input Mode Types
// ============================================

export const InputModeValues = {
  PLAN: 'plan',
  BYPASS: 'bypass',
  ASK_BEFORE_EDIT: 'ask_before_edit',
  AUTO_EDIT: 'auto_edit',
  AUTO: 'auto',
} as const;

export type InputMode = typeof InputModeValues[keyof typeof InputModeValues];

const KNOWN_INPUT_MODES: readonly string[] = Object.values(InputModeValues);

/**
 * Whether `value` is a recognized InputMode. Used when a mode arrives from an
 * external source (backend `lastReportedMode` on session reload) that this
 * codebase does not fully control the vocabulary of — a value it does not
 * recognize must not be cast and applied to the composer.
 */
export function isValidInputMode(value: unknown): value is InputMode {
  return typeof value === 'string' && KNOWN_INPUT_MODES.includes(value);
}

export interface InputModeConfig {
  id: InputMode;
  icon: string;               // codicon 아이콘 이름 (예: 'tasklist', 'zap')
  label: string;              // 표시 라벨
  description: string;        // 툴팁 설명
  borderColor: string;        // Tailwind 테두리 색상 클래스 (unfocused)
  borderColorFocused: string; // Tailwind 테두리 색상 클래스 (focused)
  outline: string;            // Tailwind outline 색상 클래스 (focused)
  textColor: string;          // 텍스트 색상 클래스
  hoverBg: string;            // 호버 시 배경색
  sendButtonBg: string;       // 전송 버튼 배경색
}

export const INPUT_MODES: Record<InputMode, InputModeConfig> = {
  plan: {
    id: 'plan',
    icon: 'tasklist',
    label: 'Plan mode',
    description: 'Claude will explore the code and present a plan before editing',
    borderColor: 'border-blue-500/50',
    borderColorFocused: 'border-blue-500',
    outline: 'outline-blue-500/15',
    textColor: 'text-blue-500',
    hoverBg: 'hover:bg-surface-hover',
    sendButtonBg: 'bg-blue-500',
  },
  auto: {
    id: 'auto',
    icon: 'sparkle',
    label: 'Auto mode',
    description: 'Claude will automatically choose the best permission mode for each task',
    borderColor: 'border-red-500/50',
    borderColorFocused: 'border-red-500',
    outline: 'outline-red-500/15',
    textColor: 'text-red-500',
    hoverBg: 'hover:bg-state-error-bg',
    sendButtonBg: 'bg-red-500',
  },
  bypass: {
    id: 'bypass',
    icon: 'zap',
    label: 'Bypass permissions',
    description: 'Claude will not ask for approval before running potentially dangerous commands',
    borderColor: 'border-red-500/50',
    borderColorFocused: 'border-red-500',
    outline: 'outline-red-500/15',
    textColor: 'text-red-500',
    hoverBg: 'hover:bg-state-error-bg',
    sendButtonBg: 'bg-red-500',
  },
  ask_before_edit: {
    id: 'ask_before_edit',
    icon: 'comment-discussion',
    label: 'Ask before edits',
    description: 'Claude will ask for approval before making each edit',
    borderColor: 'border-orange-500/50',
    borderColorFocused: 'border-orange-500',
    outline: 'outline-orange-500/15',
    textColor: 'text-orange-500',
    hoverBg: 'hover:bg-state-pending-bg',
    sendButtonBg: 'bg-orange-500',
  },
  auto_edit: {
    id: 'auto_edit',
    icon: 'robot',
    label: 'Edit automatically',
    description: 'Claude will edit your selected text or the whole file',
    borderColor: 'border-gray-400/50',
    borderColorFocused: 'border-gray-400',
    outline: 'outline-gray-400/15',
    textColor: 'text-gray-400',
    hoverBg: 'hover:bg-state-success-bg',
    sendButtonBg: 'bg-gray-400',
  },
};

// 모드 순환 순서. auto는 가용할 때만 노출되며, 공식 CLI 순환을 따라 맨 끝에 둔다.
export const MODE_CYCLE: InputMode[] = [
  InputModeValues.PLAN,
  InputModeValues.AUTO,
  InputModeValues.BYPASS,
  InputModeValues.ASK_BEFORE_EDIT,
  InputModeValues.AUTO_EDIT,
];

/**
 * Returns available input modes for the cycle/menu.
 * - bypass is excluded when `bypassDisabled` (policy).
 * - auto is excluded unless `autoAvailable` — the CLI gates auto on model
 *   (`supportsAutoMode`), version, plan, provider and admin policy, surfaced to
 *   us as a single availability flag. Defaults to false so callers without that
 *   context (e.g. settings page) never show auto.
 */
export function getAvailableModes(bypassDisabled: boolean, autoAvailable = false): InputMode[] {
  return MODE_CYCLE.filter(mode => {
    if (mode === InputModeValues.BYPASS && bypassDisabled) return false;
    if (mode === InputModeValues.AUTO && !autoAvailable) return false;
    return true;
  });
}

/**
 * InputMode -> Claude CLI --permission-mode flag value mapping
 */
export const INPUT_MODE_TO_CLI_FLAG: Record<InputMode, string> = {
  [InputModeValues.PLAN]: 'plan',
  [InputModeValues.BYPASS]: 'bypassPermissions',
  [InputModeValues.ASK_BEFORE_EDIT]: 'default',
  [InputModeValues.AUTO_EDIT]: 'acceptEdits',
  [InputModeValues.AUTO]: 'auto',
} as const;

/**
 * Claude CLI --permission-mode flag -> InputMode reverse mapping
 */
export const CLI_FLAG_TO_INPUT_MODE: Record<string, InputMode> = {
  plan: InputModeValues.PLAN,
  bypassPermissions: InputModeValues.BYPASS,
  default: InputModeValues.ASK_BEFORE_EDIT,
  acceptEdits: InputModeValues.AUTO_EDIT,
  auto: InputModeValues.AUTO,
} as const;

// ============================================
// Active File Types (IDE에서 전달받을 타입)
// ============================================

export interface ActiveFile {
  path: string;           // 전체 경로
  fileName: string;       // 파일명만
  isSelected: boolean;    // 컨텍스트로 선택됨
}
