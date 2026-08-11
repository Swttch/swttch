import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

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
}

function createDefaultProfile(): ProfileData {
  return {
    uuid: randomUUID(),
    telemetryConsent: { status: ConsentStatus.PENDING, decidedAt: null },
    dismissedAnnouncementIds: [],
    announcementsEnabled: true,
    runnerBestScore: 0,
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

async function writeProfile(profile: ProfileData): Promise<void> {
  await mkdir(PROFILE_DIR, { recursive: true });
  await writeFile(PROFILE_FILE, JSON.stringify(profile, null, 2) + '\n', 'utf-8');
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
    };

    // 누락/손상 필드를 보정했으면 파일을 다시 써서 정규화한다.
    const needsRewrite =
      parsed.uuid !== profile.uuid ||
      parsed.telemetryConsent?.status !== profile.telemetryConsent.status ||
      parsed.telemetryConsent?.decidedAt !== profile.telemetryConsent.decidedAt ||
      !Array.isArray(parsed.dismissedAnnouncementIds) ||
      parsed.dismissedAnnouncementIds.length !== dismissedAnnouncementIds.length ||
      typeof parsed.announcementsEnabled !== 'boolean' ||
      parsed.runnerBestScore !== runnerBestScore;
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
