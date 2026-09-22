import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { atomicWriteFile } from './atomic-json';

// ─── User profile (global, telemetry-independent) ────────────────────────────
// `~/.claude-code-gui/profile.json` holds a per-install pseudonymous uuid and the
// telemetry consent decision. The uuid is created for EVERY user regardless of
// consent; nothing is transmitted unless consent status is ACCEPTED.

const PROFILE_DIR = join(homedir(), '.claude-code-gui');
const PROFILE_FILE = join(PROFILE_DIR, 'profile.json');

/** 텔레메트리 동의 상태. PENDING = 아직 수락/거절 중 무엇도 응답하지 않음. */
export enum ConsentStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DENIED = 'denied',
}

export interface TelemetryConsent {
  status: ConsentStatus;
  /** 수락/거절을 결정한 시각(ISO 8601). 미응답이면 null. */
  decidedAt: string | null;
}

/**
 * 음성 입력을 처음 쓰려 할 때 한 번 묻는 질문의 응답 상태.
 * PENDING = 아직 응답하지 않음(다음 마이크 클릭에서 다시 묻는다).
 */
export enum VoicePromptStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
}

export interface VoicePrompt {
  status: VoicePromptStatus;
  /**
   * 질문을 띄운 시각(ISO 8601). 아직 띄운 적이 없으면 null.
   *
   * 응답 시각과 따로 두는 이유: 물었는데 응답 없이 앱을 닫은 경우가
   * "묻지 않았다"와 구분되어야 한다. 다시 물을 때마다 최신 시각으로 갱신한다.
   * 킷이 이미 설치돼 있어 묻지 않고 ACCEPTED로 시작한 경우는 null로 남는다.
   */
  askedAt: string | null;
  /** 응답한 시각(ISO 8601). 미응답이면 null. */
  decidedAt: string | null;
}

export interface ProfileData {
  /** 설치 단위 가명 식별자. 동의 여부와 무관하게 항상 존재한다. */
  uuid: string;
  telemetryConsent: TelemetryConsent;
  /** 사용자가 닫은(dismiss) 공지(Announcement) id 목록. 서버 공지의 `id` 필드와 매칭된다. */
  dismissedAnnouncementIds: string[];
  /** 공지(Announcement) 수신 여부. 기본값 true. false면 백엔드는 원격 fetch 자체를 하지 않는다. */
  announcementsEnabled: boolean;
  /** 러너 게임(이스터에그) 최고 점수. 아직 기록이 없으면 0. */
  runnerBestScore: number;
  /** 음성 입력을 쓸지 한 번 물은 질문의 응답. 설치 단위(글로벌)로 한 번만 묻는다. */
  voicePrompt: VoicePrompt;
  /**
   * "What's new" 팝업을 마지막으로 띄운 플러그인 버전. 한 번도 띄운 적이 없으면 null.
   *
   * 웹뷰의 localStorage가 아니라 여기에 두는 이유: JetBrains 모드의 웹뷰 주소는
   * `http://localhost:<매번 새로 할당되는 포트>`라서, IDE를 재시작할 때마다 origin이
   * 바뀌고 localStorage가 통째로 빈 채로 시작된다. 기록이 매번 사라지니 설치된 버전과
   * 비교할 대상이 없어 팝업이 영영 뜨지 못했다(#453).
   */
  whatsNewSeenVersion: string | null;
  /**
   * 사용자가 온보딩 체크리스트를 닫았는지. 기본값 false.
   *
   * 웹뷰가 아니라 여기에 두는 이유는 `whatsNewSeenVersion`과 같다. JetBrains 모드의
   * 웹뷰 주소는 `http://localhost:<매번 새로 할당되는 포트>`라서 IDE를 재시작할 때마다
   * origin이 바뀌고 `localStorage`가 통째로 빈 채로 시작된다(#453). 거기에 두면
   * 닫아도 다음 실행에 다시 떠서, 닫기 버튼이 그 실행에서만 듣는 말이 된다.
   *
   * 항목의 완료 여부는 여기 담지 않는다. 그건 기록이 아니라 지금 기계의 상태이고,
   * 매번 새로 물어야 맞는 답이 나온다 — 킷을 터미널에서 지운 사람에게 "설치됨"으로
   * 남아 있으면 그 기록이 사용자를 속인다.
   */
  onboardingDismissed: boolean;
}

function createDefaultProfile(): ProfileData {
  return {
    uuid: randomUUID(),
    telemetryConsent: { status: ConsentStatus.PENDING, decidedAt: null },
    dismissedAnnouncementIds: [],
    announcementsEnabled: true,
    runnerBestScore: 0,
    voicePrompt: { status: VoicePromptStatus.PENDING, askedAt: null, decidedAt: null },
    whatsNewSeenVersion: null,
    onboardingDismissed: false,
  };
}

/** 문자열이 아닌 값을 걸러내 보정한다. 배열이 아니면 빈 배열로 취급한다. */
export function normalizeDismissedAnnouncementIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/** 저장된 status가 알 수 없는 값이면 PENDING으로 보정한다. */
function normalizeStatus(status: ConsentStatus | undefined): ConsentStatus {
  return status === ConsentStatus.ACCEPTED || status === ConsentStatus.DENIED
    ? status
    : ConsentStatus.PENDING;
}

/** 저장된 값이 boolean이 아니면(누락/손상) 기본값 true로 보정한다. */
function normalizeAnnouncementsEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : true;
}

/** 점수가 아닌 값(누락/손상/음수/소수)이면 0으로 보정한다. */
function normalizeRunnerBestScore(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * 버전 문자열이 아닌 값(누락/손상)은 null로 보정한다.
 *
 * 필드가 통째로 없는 기존 사용자는 null로 시작한다. 설치된 버전과 다르므로 다음 실행에서
 * 팝업을 한 번 보고, 그때 기록된다.
 */
export function normalizeWhatsNewSeenVersion(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * boolean이 아닌 값(누락/손상)은 false로 보정한다.
 *
 * 필드가 통째로 없는 기존 사용자는 "닫지 않았다"로 시작한다. 체크리스트를 도입하기
 * 전에는 닫을 기회 자체가 없었으므로 그것이 사실이다.
 */
export function normalizeOnboardingDismissed(value: unknown): boolean {
  return value === true;
}

/** ISO 문자열이 아닌 값(누락/손상)은 null로 보정한다. */
function normalizeTimestamp(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * voicePrompt를 보정한다. 필드가 통째로 없는 기존 사용자는 PENDING으로 시작하므로,
 * 다음에 마이크를 누를 때 질문을 받는다.
 */
export function normalizeVoicePrompt(value: unknown): VoicePrompt {
  const raw = (value ?? {}) as Partial<VoicePrompt>;
  const status =
    raw.status === VoicePromptStatus.ACCEPTED || raw.status === VoicePromptStatus.DECLINED
      ? raw.status
      : VoicePromptStatus.PENDING;
  return {
    status,
    askedAt: normalizeTimestamp(raw.askedAt),
    // 미응답 상태에서 남아 있는 응답 시각은 모순이므로 버린다.
    decidedAt: status === VoicePromptStatus.PENDING ? null : normalizeTimestamp(raw.decidedAt),
  };
}

async function writeProfile(profile: ProfileData): Promise<void> {
  await mkdir(PROFILE_DIR, { recursive: true });
  await atomicWriteFile(PROFILE_FILE, JSON.stringify(profile, null, 2) + '\n');
}

/**
 * profile.json을 읽어 반환한다. 파일이나 필드가 없거나 손상됐으면 보정해 다시 저장한다.
 * uuid는 동의 여부와 무관하게 항상 보장된다(없으면 생성). 서버 시작 시 1회 호출한다.
 */
export async function ensureProfile(): Promise<ProfileData> {
  if (!existsSync(PROFILE_FILE)) {
    const profile = createDefaultProfile();
    await writeProfile(profile);
    return profile;
  }

  try {
    const raw = await readFile(PROFILE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ProfileData>;

    const dismissedAnnouncementIds = normalizeDismissedAnnouncementIds(
      parsed.dismissedAnnouncementIds,
    );
    const announcementsEnabled = normalizeAnnouncementsEnabled(parsed.announcementsEnabled);
    const runnerBestScore = normalizeRunnerBestScore(parsed.runnerBestScore);
    const voicePrompt = normalizeVoicePrompt(parsed.voicePrompt);
    const whatsNewSeenVersion = normalizeWhatsNewSeenVersion(parsed.whatsNewSeenVersion);
    const onboardingDismissed = normalizeOnboardingDismissed(parsed.onboardingDismissed);

    const profile: ProfileData = {
      uuid:
        typeof parsed.uuid === 'string' && parsed.uuid.length > 0 ? parsed.uuid : randomUUID(),
      telemetryConsent: {
        status: normalizeStatus(parsed.telemetryConsent?.status),
        decidedAt: parsed.telemetryConsent?.decidedAt ?? null,
      },
      dismissedAnnouncementIds,
      announcementsEnabled,
      runnerBestScore,
      voicePrompt,
      whatsNewSeenVersion,
      onboardingDismissed,
    };

    // 누락/손상 필드를 보정했으면 파일을 다시 써서 정규화한다.
    const needsRewrite =
      parsed.uuid !== profile.uuid ||
      parsed.telemetryConsent?.status !== profile.telemetryConsent.status ||
      parsed.telemetryConsent?.decidedAt !== profile.telemetryConsent.decidedAt ||
      !Array.isArray(parsed.dismissedAnnouncementIds) ||
      parsed.dismissedAnnouncementIds.length !== dismissedAnnouncementIds.length ||
      typeof parsed.announcementsEnabled !== 'boolean' ||
      parsed.runnerBestScore !== runnerBestScore ||
      parsed.voicePrompt?.status !== voicePrompt.status ||
      parsed.voicePrompt?.askedAt !== voicePrompt.askedAt ||
      parsed.voicePrompt?.decidedAt !== voicePrompt.decidedAt ||
      // 필드가 통째로 없는 기존 프로필은 "손상"이 아니라 "아직 없음"이고, 없을 때 읽히는 값이
      // 곧 기본값 null이다. undefined와 null을 같게 봐야 이 필드를 도입했다는 이유만으로
      // 모든 기존 사용자의 파일을 한 번씩 다시 쓰지 않는다.
      (parsed.whatsNewSeenVersion ?? null) !== whatsNewSeenVersion ||
      // 같은 이유로 undefined와 false를 같게 본다. 필드를 도입했다는 것만으로
      // 모든 기존 사용자의 파일을 한 번씩 다시 쓰지 않는다.
      (parsed.onboardingDismissed ?? false) !== onboardingDismissed;
    if (needsRewrite) {
      await writeProfile(profile);
    }
    return profile;
  } catch {
    // JSON 파싱 실패 등 손상: 새 프로필로 복구한다(기존 uuid는 보존 불가).
    const profile = createDefaultProfile();
    await writeProfile(profile);
    return profile;
  }
}

/** 현재 프로필을 읽는다(없으면 생성). */
export async function readProfile(): Promise<ProfileData> {
  return ensureProfile();
}

/** 텔레메트리 수락(accept)/거부(deny)를 타임스탬프와 함께 기록한다. */
export async function setTelemetryConsent(accepted: boolean): Promise<ProfileData> {
  const profile = await ensureProfile();
  profile.telemetryConsent = {
    status: accepted ? ConsentStatus.ACCEPTED : ConsentStatus.DENIED,
    decidedAt: new Date().toISOString(),
  };
  await writeProfile(profile);
  return profile;
}

/** 음성 입력 질문의 현재 응답 상태를 읽는다. */
export async function getVoicePrompt(): Promise<VoicePrompt> {
  const profile = await ensureProfile();
  return profile.voicePrompt;
}

/**
 * 질문을 띄운 시각을 기록한다. 상태는 건드리지 않는다 — 아직 응답이 아니기 때문이다.
 * 이미 응답한 뒤라면 다시 묻지 않으므로 아무것도 하지 않는다.
 */
export async function markVoicePromptAsked(): Promise<VoicePrompt> {
  const profile = await ensureProfile();
  if (profile.voicePrompt.status !== VoicePromptStatus.PENDING) return profile.voicePrompt;
  profile.voicePrompt = { ...profile.voicePrompt, askedAt: new Date().toISOString() };
  await writeProfile(profile);
  return profile.voicePrompt;
}

/**
 * 사용자의 응답을 기록한다.
 *
 * 설치 실패는 응답을 되돌리지 않는다 — 사용자의 의사는 "쓰겠다"였고, 실패는 그 의사와
 * 별개다. 그래서 accepted는 설치 결과가 아니라 버튼을 누른 사실을 남긴다.
 */
export async function setVoicePromptDecision(accepted: boolean): Promise<VoicePrompt> {
  const profile = await ensureProfile();
  profile.voicePrompt = {
    status: accepted ? VoicePromptStatus.ACCEPTED : VoicePromptStatus.DECLINED,
    askedAt: profile.voicePrompt.askedAt,
    decidedAt: new Date().toISOString(),
  };
  await writeProfile(profile);
  return profile.voicePrompt;
}

/**
 * 킷이 이미 설치돼 있으면 묻지 않고 ACCEPTED로 시작한다.
 *
 * 이미 킷을 가진 사람에게 "설치하시겠습니까"는 물을 이유가 없다. 묻지 않았으므로
 * askedAt은 null로 두고, decidedAt에는 이렇게 정해진 시각을 남긴다.
 * 이미 응답이 있으면 그 응답이 우선이므로 건드리지 않는다.
 */
export async function acceptVoicePromptForInstalledKit(): Promise<VoicePrompt> {
  const profile = await ensureProfile();
  if (profile.voicePrompt.status !== VoicePromptStatus.PENDING) return profile.voicePrompt;
  profile.voicePrompt = {
    status: VoicePromptStatus.ACCEPTED,
    askedAt: null,
    decidedAt: new Date().toISOString(),
  };
  await writeProfile(profile);
  return profile.voicePrompt;
}

/** 현재까지 닫은(dismiss) 공지 id 목록을 읽는다. */
export async function getDismissedAnnouncementIds(): Promise<string[]> {
  const profile = await ensureProfile();
  return profile.dismissedAnnouncementIds;
}

/** dismissedAnnouncementIds의 상한. 초과 시 가장 오래된 항목부터 버려 무한 증가를 막는다. */
const MAX_DISMISSED_ANNOUNCEMENT_IDS = 500;

/**
 * 공지 id를 dismissedAnnouncementIds에 추가한다(이미 있으면 무시, 중복 추가 안 함).
 * 목록이 상한을 넘으면 가장 오래된 항목부터 제거(FIFO)한다.
 * 갱신된(또는 기존과 동일한) 전체 목록을 반환한다.
 */
export async function setDismissedAnnouncement(id: string): Promise<string[]> {
  const profile = await ensureProfile();
  if (!profile.dismissedAnnouncementIds.includes(id)) {
    profile.dismissedAnnouncementIds = [...profile.dismissedAnnouncementIds, id].slice(
      -MAX_DISMISSED_ANNOUNCEMENT_IDS,
    );
    await writeProfile(profile);
  }
  return profile.dismissedAnnouncementIds;
}

/** 현재 공지(Announcement) 수신 설정을 읽는다(기본값 true). */
export async function getAnnouncementsEnabled(): Promise<boolean> {
  const profile = await ensureProfile();
  return profile.announcementsEnabled;
}

/** 공지 수신 on/off를 기록한다. */
export async function setAnnouncementsEnabled(enabled: boolean): Promise<ProfileData> {
  const profile = await ensureProfile();
  profile.announcementsEnabled = enabled;
  await writeProfile(profile);
  return profile;
}

/** "What's new" 팝업을 마지막으로 띄운 버전을 읽는다(띄운 적이 없으면 null). */
export async function getWhatsNewSeenVersion(): Promise<string | null> {
  const profile = await ensureProfile();
  return profile.whatsNewSeenVersion;
}

/** "What's new" 팝업을 띄운 버전을 기록한다. */
export async function setWhatsNewSeenVersion(version: string): Promise<string | null> {
  const profile = await ensureProfile();
  profile.whatsNewSeenVersion = normalizeWhatsNewSeenVersion(version);
  await writeProfile(profile);
  return profile.whatsNewSeenVersion;
}

/** 온보딩 체크리스트를 닫은 적이 있는지 읽는다. */
export async function getOnboardingDismissed(): Promise<boolean> {
  const profile = await ensureProfile();
  return profile.onboardingDismissed;
}

/**
 * 체크리스트를 닫았다는 사실을 기록한다.
 *
 * 되돌리는 경로(false로 쓰기)도 열어둔다. 지금 UI에는 다시 여는 버튼이 없지만,
 * 한 번 닫으면 영영 못 여는 값을 파일에 남기는 것은 사용자 자산을 일방통행으로
 * 만드는 일이다.
 */
export async function setOnboardingDismissed(dismissed: boolean): Promise<boolean> {
  const profile = await ensureProfile();
  profile.onboardingDismissed = normalizeOnboardingDismissed(dismissed);
  await writeProfile(profile);
  return profile.onboardingDismissed;
}

/** 러너 게임 최고 점수를 읽는다(기록이 없으면 0). */
export async function getRunnerBestScore(): Promise<number> {
  const profile = await ensureProfile();
  return profile.runnerBestScore;
}

/**
 * 러너 게임 점수를 기록한다. 기존 최고 기록보다 높을 때만 갱신하므로,
 * 판이 끝날 때마다 그대로 보내도 최고 기록이 낮아지지 않는다.
 * 갱신 여부와 무관하게 현재 최고 기록을 반환한다.
 */
export async function setRunnerBestScore(score: number): Promise<number> {
  const best = normalizeRunnerBestScore(score);
  const profile = await ensureProfile();
  if (best > profile.runnerBestScore) {
    profile.runnerBestScore = best;
    await writeProfile(profile);
  }
  return profile.runnerBestScore;
}
