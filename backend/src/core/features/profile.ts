import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { atomicWriteFile, refusedWriteMessage } from './atomic-json';

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
   * When the onboarding checklist card was closed (ISO 8601), or null while it
   * has never been closed.
   *
   * The card is a once-per-install thing, so this is the ONLY value that decides
   * whether it is raised: null means raise it, anything else means never again.
   * How far the individual steps got does not enter into it — a card closed with
   * every step unfinished is just as closed as one closed with all of them done.
   *
   * It lives here rather than in the webview for the same reason as
   * `whatsNewSeenVersion`. A JetBrains-mode webview is served from
   * `http://localhost:<a port picked afresh at every launch>`, so the origin
   * changes on every IDE restart and `localStorage` starts empty (#453). Kept
   * there, the record would be gone by the next launch and the close button
   * would only hold for the run it was pressed in.
   *
   * Per-step completion is NOT kept here. That is the state of the machine right
   * now rather than history, and only a fresh lookup answers it correctly — a
   * stored "installed" would go on lying to someone who removed the kit in a
   * terminal.
   */
  onboardingDismissedAt: string | null;
}

/**
 * The key v0.32.2 kept the same fact under, as a boolean.
 *
 * It recorded THAT the card was closed but not when. A profile carrying it gets
 * the moment of the migration instead — the point of the record is that the card
 * was closed at all, and inventing a truer timestamp is not possible.
 */
const LEGACY_ONBOARDING_DISMISSED_KEY = 'onboardingDismissed';

function createDefaultProfile(): ProfileData {
  return {
    uuid: randomUUID(),
    telemetryConsent: { status: ConsentStatus.PENDING, decidedAt: null },
    dismissedAnnouncementIds: [],
    announcementsEnabled: true,
    runnerBestScore: 0,
    voicePrompt: { status: VoicePromptStatus.PENDING, askedAt: null, decidedAt: null },
    whatsNewSeenVersion: null,
    onboardingDismissedAt: null,
  };
}

/**
 * What callers get while `profile.json` exists but cannot be read.
 *
 * This is NOT {@link createDefaultProfile}, and the difference is the whole
 * point. A default profile says "this user has decided nothing yet", which for
 * every field here means "ask them again". Asking again is the wrong move twice
 * over: the question may already have been answered, and the answer cannot be
 * saved anyway, because every writer below refuses while the file is unreadable.
 * The user would be asked at every launch and their reply would go nowhere.
 *
 * So the rule for this shape is: **do not ask a question whose answer we cannot
 * store, and do not act on a permission we cannot read.** Every field takes the
 * value that keeps quiet.
 *
 * Nothing here is ever written to disk. It exists only to answer reads for as
 * long as the file stays unreadable, and the moment the file becomes readable
 * again the user's real values come back untouched.
 */
function createUnreadableProfile(): ProfileData {
  return {
    // Fresh and in-memory only. Telemetry is off below, so this is never
    // transmitted; a fixed placeholder would instead make every install with an
    // unreadable profile look like one machine in the admin console.
    uuid: randomUUID(),
    // The two wrong answers: PENDING re-opens the consent banner (the symptom
    // this file is being changed to stop), and ACCEPTED would transmit on a
    // permission we did not actually read. DENIED sends nothing and asks nothing.
    // `decidedAt` stays null because no decision was read, let alone made.
    telemetryConsent: { status: ConsentStatus.DENIED, decidedAt: null },
    // Unused while announcements are off, and an empty list is the truth: we
    // read no dismissals.
    dismissedAnnouncementIds: [],
    // We cannot tell which announcements the user already closed, so delivering
    // any of them would re-show dismissed ones.
    announcementsEnabled: false,
    // No score was read. The setter refuses to write, so this 0 cannot overwrite
    // a real best score.
    runnerBestScore: 0,
    // Suppresses the one-time voice question rather than asking it again.
    voicePrompt: { status: VoicePromptStatus.DECLINED, askedAt: null, decidedAt: null },
    // "No version was read" rather than "no popup has ever been shown". The
    // installed version is not known here, so the suppression for the What's new
    // popup lives where the comparison happens (see whats-new.ts).
    whatsNewSeenVersion: null,
    // Suppresses the onboarding card, which the user may well have closed
    // already and cannot close again in a way that sticks. Any moment does
    // that, since only "is it null" is ever asked; this one is never written to
    // disk, so it cannot become a closing time the user did not have.
    onboardingDismissedAt: new Date().toISOString(),
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
 * Anything that is not a non-empty string (absent or corrupted) is repaired to
 * null.
 *
 * A profile that predates the field starts as "never closed", which is the
 * truth: there was no card to close. Such a machine sees the card once, and
 * closing it is what writes the record.
 */
export function normalizeOnboardingDismissedAt(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Read the current key first, and fall back to the boolean v0.32.2 wrote.
 *
 * A profile that only has the old key differs from what `needsRewrite` below
 * compares against, so that one rewrite is the move to the new key. Either way
 * the card does not come back for someone who already closed it, so even a
 * failed write costs them nothing.
 */
function readOnboardingDismissedAt(parsed: Partial<ProfileData>): string | null {
  const current = normalizeOnboardingDismissedAt(parsed.onboardingDismissedAt);
  if (current !== null) return current;
  const legacy = (parsed as Record<string, unknown>)[LEGACY_ONBOARDING_DISMISSED_KEY];
  return legacy === true ? new Date().toISOString() : null;
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
 * What a profile read found.
 *
 * `unreadable` means the file is there and we could not use it, which is the one
 * case that must never lead to a write. `profile` is filled in both cases so
 * every caller has something to answer with; on `unreadable` it is the
 * keep-quiet shape from {@link createUnreadableProfile} and not the user's data.
 */
export type ProfileLoad =
  | { status: 'ok'; profile: ProfileData }
  | { status: 'unreadable'; reason: string; profile: ProfileData };

/**
 * Remembers the reason last logged for an unreadable profile, so the log records
 * the fact once instead of once per read.
 *
 * Reads are frequent: the announcement gate, the voice prompt, the onboarding
 * flag and the consent state each call through here on ordinary requests, so
 * logging every read would bury the one line that matters under hundreds of
 * copies. Refused WRITES are logged every time, because each one is a user
 * action that did not take effect. Cleared on a successful read, so a file that
 * breaks again after being fixed is reported again.
 */
let lastUnreadableReason: string | null = null;

/**
 * Read profile.json, reporting "exists but could not be read" as its own outcome
 * rather than as an empty profile.
 *
 * The distinction is the reason this function exists. An ABSENT file has nothing
 * to lose, so it is created with defaults exactly as before. A file that exists
 * and fails to parse is the user's data that we merely failed to read, and
 * replacing it destroys their telemetry decision, their runner best score, the
 * announcements they dismissed and the version they last saw What's new for.
 * That is not a hypothetical: an empty profile.json makes `JSON.parse('')` throw
 * and the old code went straight to overwriting it.
 *
 * This is the rule `atomic-json.ts` already sets out for every JSON file we do
 * not own (issue #386): "cannot be read" is not "is empty", and the answer is to
 * refuse the write. profile.json is ours to create but the contents are the
 * user's, so the same rule applies.
 */
export async function loadProfile(): Promise<ProfileLoad> {
  if (!existsSync(PROFILE_FILE)) {
    const profile = createDefaultProfile();
    await writeProfile(profile);
    lastUnreadableReason = null;
    return { status: 'ok', profile };
  }

  let raw: string;
  try {
    raw = await readFile(PROFILE_FILE, 'utf-8');
  } catch (err) {
    return await reportUnreadable(err instanceof Error ? err.message : String(err));
  }

  let parsed: Partial<ProfileData>;
  try {
    // An empty file lands here: JSON.parse('') throws, and that is the exact
    // shape that erased a real user's consent record.
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      // Valid JSON is not the same thing as a profile. `null`, `[1,2]` and
      // `"text"` all parse, and none of them is something to read fields off.
      return await reportUnreadable(`expected a JSON object, found ${describeParsed(value)}`);
    }
    parsed = value as Partial<ProfileData>;
  } catch (err) {
    return await reportUnreadable(err instanceof Error ? err.message : String(err));
  }

  lastUnreadableReason = null;

  {
    const dismissedAnnouncementIds = normalizeDismissedAnnouncementIds(
      parsed.dismissedAnnouncementIds,
    );
    const announcementsEnabled = normalizeAnnouncementsEnabled(parsed.announcementsEnabled);
    const runnerBestScore = normalizeRunnerBestScore(parsed.runnerBestScore);
    const voicePrompt = normalizeVoicePrompt(parsed.voicePrompt);
    const whatsNewSeenVersion = normalizeWhatsNewSeenVersion(parsed.whatsNewSeenVersion);
    const onboardingDismissedAt = readOnboardingDismissedAt(parsed);

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
      onboardingDismissedAt,
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
      // 같은 이유로 undefined와 null을 같게 본다. 필드를 도입했다는 것만으로
      // 모든 기존 사용자의 파일을 한 번씩 다시 쓰지 않는다.
      // A profile that only has v0.32.2's boolean key differs here, so that one
      // rewrite is what moves it onto the current key.
      (parsed.onboardingDismissedAt ?? null) !== onboardingDismissedAt;
    if (needsRewrite) {
      await writeProfile(profile);
    }
    return { status: 'ok', profile };
  }
}

function describeParsed(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

/**
 * Log the read failure at most once per reason, then answer with the quiet shape.
 *
 * Every failure path in {@link loadProfile} ends here, so this one function is
 * what decides that an unreadable profile is reported rather than replaced. It is
 * async so that all three call sites read the same whether or not the decision
 * ever needs to touch the disk.
 */
async function reportUnreadable(reason: string): Promise<ProfileLoad> {
  if (lastUnreadableReason !== reason) {
    lastUnreadableReason = reason;
    console.error(
      '[node-backend]',
      `could not read ${PROFILE_FILE} (${reason}); leaving it untouched and treating this ` +
        'install as having made no decisions until it can be read',
    );
  }
  return { status: 'unreadable', reason, profile: createUnreadableProfile() };
}

/**
 * Read profile.json. An absent file is created with defaults, and missing or
 * corrupt FIELDS are normalized and saved back. The uuid is always present
 * regardless of the consent decision (generated when absent). Called once when
 * the server starts.
 *
 * A file that exists and cannot be read is NOT overwritten. The value returned
 * then is not the user's data but the keep-quiet shape from
 * {@link createUnreadableProfile}, and the failure is logged. A caller that needs
 * to know about the failure itself uses {@link loadProfile} directly.
 */
export async function ensureProfile(): Promise<ProfileData> {
  return (await loadProfile()).profile;
}

/**
 * Run a read-modify-write over profile.json, refusing the write when the file
 * exists but could not be read.
 *
 * Every setter goes through here rather than calling `writeProfile` itself. Left
 * to themselves they would each read, mutate and save, and a failed read would
 * put a default profile plus one changed field on disk — the same destruction as
 * before, one step later. Routing them through one function means a new setter
 * gets the refusal for free instead of having to remember it.
 *
 * `mutate` returning `null` means "nothing to change" and skips the write, which
 * is how the setters that only save on a real change express that.
 */
async function updateProfile(
  action: string,
  mutate: (profile: ProfileData) => ProfileData | null,
): Promise<ProfileData> {
  const load = await loadProfile();
  if (load.status === 'unreadable') {
    // Logged on every refusal, unlike the read failure above: each one is a
    // thing the user asked for that did not happen.
    console.error(
      '[node-backend]',
      `${refusedWriteMessage(PROFILE_FILE, load.reason)} — ${action} was not saved`,
    );
    return load.profile;
  }
  const next = mutate(load.profile);
  if (next === null) return load.profile;
  await writeProfile(next);
  return next;
}

/** 현재 프로필을 읽는다(없으면 생성). */
export async function readProfile(): Promise<ProfileData> {
  return ensureProfile();
}

/** 텔레메트리 수락(accept)/거부(deny)를 타임스탬프와 함께 기록한다. */
export async function setTelemetryConsent(accepted: boolean): Promise<ProfileData> {
  return updateProfile('the telemetry consent decision', (profile) => {
    profile.telemetryConsent = {
      status: accepted ? ConsentStatus.ACCEPTED : ConsentStatus.DENIED,
      decidedAt: new Date().toISOString(),
    };
    return profile;
  });
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
  const profile = await updateProfile('the time the voice question was shown', (current) => {
    if (current.voicePrompt.status !== VoicePromptStatus.PENDING) return null;
    current.voicePrompt = { ...current.voicePrompt, askedAt: new Date().toISOString() };
    return current;
  });
  return profile.voicePrompt;
}

/**
 * 사용자의 응답을 기록한다.
 *
 * 설치 실패는 응답을 되돌리지 않는다 — 사용자의 의사는 "쓰겠다"였고, 실패는 그 의사와
 * 별개다. 그래서 accepted는 설치 결과가 아니라 버튼을 누른 사실을 남긴다.
 */
export async function setVoicePromptDecision(accepted: boolean): Promise<VoicePrompt> {
  const profile = await updateProfile('the answer to the voice question', (current) => {
    current.voicePrompt = {
      status: accepted ? VoicePromptStatus.ACCEPTED : VoicePromptStatus.DECLINED,
      askedAt: current.voicePrompt.askedAt,
      decidedAt: new Date().toISOString(),
    };
    return current;
  });
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
  const profile = await updateProfile('the voice answer implied by an installed kit', (current) => {
    if (current.voicePrompt.status !== VoicePromptStatus.PENDING) return null;
    current.voicePrompt = {
      status: VoicePromptStatus.ACCEPTED,
      askedAt: null,
      decidedAt: new Date().toISOString(),
    };
    return current;
  });
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
  const profile = await updateProfile(`dismissing announcement ${id}`, (current) => {
    if (current.dismissedAnnouncementIds.includes(id)) return null;
    current.dismissedAnnouncementIds = [...current.dismissedAnnouncementIds, id].slice(
      -MAX_DISMISSED_ANNOUNCEMENT_IDS,
    );
    return current;
  });
  return profile.dismissedAnnouncementIds;
}

/** 현재 공지(Announcement) 수신 설정을 읽는다(기본값 true). */
export async function getAnnouncementsEnabled(): Promise<boolean> {
  const profile = await ensureProfile();
  return profile.announcementsEnabled;
}

/** 공지 수신 on/off를 기록한다. */
export async function setAnnouncementsEnabled(enabled: boolean): Promise<ProfileData> {
  return updateProfile('the announcements on/off setting', (profile) => {
    profile.announcementsEnabled = enabled;
    return profile;
  });
}

/** "What's new" 팝업을 마지막으로 띄운 버전을 읽는다(띄운 적이 없으면 null). */
export async function getWhatsNewSeenVersion(): Promise<string | null> {
  const profile = await ensureProfile();
  return profile.whatsNewSeenVersion;
}

/** "What's new" 팝업을 띄운 버전을 기록한다. */
export async function setWhatsNewSeenVersion(version: string): Promise<string | null> {
  const profile = await updateProfile('the version What\'s new was shown for', (current) => {
    current.whatsNewSeenVersion = normalizeWhatsNewSeenVersion(version);
    return current;
  });
  return profile.whatsNewSeenVersion;
}

/** When the onboarding checklist card was closed, or null if it never was. */
export async function getOnboardingDismissedAt(): Promise<string | null> {
  const profile = await ensureProfile();
  return profile.onboardingDismissedAt;
}

/**
 * Record that the onboarding checklist card was closed, now.
 *
 * The clock is read here rather than taken from the caller: the record exists to
 * be compared against nothing at all (null or not), and a webview's clock is one
 * more thing that can be wrong about a file the user owns.
 *
 * An already-closed card keeps its original moment. Closing it twice is not a
 * thing that happens — it is never raised again — and if it somehow did, the
 * first time is the one worth keeping.
 */
export async function dismissOnboarding(): Promise<string | null> {
  const profile = await updateProfile('closing the onboarding checklist', (current) => {
    // Already closed: nothing to write, so nothing is written. `updateProfile`
    // takes null as "leave the file alone".
    if (current.onboardingDismissedAt !== null) return null;
    current.onboardingDismissedAt = new Date().toISOString();
    return current;
  });
  return profile.onboardingDismissedAt;
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
  const profile = await updateProfile('the runner best score', (current) => {
    if (best <= current.runnerBestScore) return null;
    current.runnerBestScore = best;
    return current;
  });
  return profile.runnerBestScore;
}
