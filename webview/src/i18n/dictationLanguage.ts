/**
 * Which language the transcription service should listen for.
 *
 * Claude Code has no dedicated dictation-language setting: its `language` key —
 * the one that decides what language Claude replies in — doubles as the
 * dictation language, and accepts either a BCP-47 code ('ja') or a plain name
 * ('japanese').
 *
 * That single key is not enough, because the two genuinely come apart: someone
 * can have Claude answer in Korean while speaking English. So we offer a spoken
 * language of our own, and — unlike the documented order — let it win when it
 * is set. See {@link resolveDictationLanguage} for why.
 */

import { LANGUAGE_TO_LOCALE } from './languageMap';

/**
 * The languages Claude Code documents as supported for dictation.
 *
 * Anything outside this list is accepted by the setting but transcribed as
 * English by the service, so the UI separates them rather than pretending they
 * all work equally.
 */
export const DICTATION_SUPPORTED_CODES = [
  'cs', 'da', 'nl', 'en', 'fr', 'de', 'el', 'hi', 'id', 'it',
  'ja', 'ko', 'no', 'pl', 'pt', 'ru', 'es', 'sv', 'tr', 'uk',
] as const;

const SUPPORTED = new Set<string>(DICTATION_SUPPORTED_CODES);

/** Is this a language the service actually transcribes, rather than falling back to English? */
export function isDictationSupported(code: string | null | undefined): boolean {
  if (!code) return false;
  // 'pt-BR' is served by the 'pt' model; match on the primary subtag.
  return SUPPORTED.has(primarySubtag(code));
}

/** The part before the first '-': 'pt-BR' → 'pt'. */
function primarySubtag(code: string): string {
  return code.split('-')[0].toLowerCase();
}

/** One selectable language: the code we send, and its name in the reader's language. */
export interface DictationLanguageOption {
  code: string;
  label: string;
  /** False for languages the service transcribes as English regardless. */
  supported: boolean;
}

/**
 * Every language the platform can name, labelled in `displayLocale`.
 *
 * Generated rather than hand-listed: the set of languages is not ours to
 * curate, and a fixed list would leave gaps that are indefensible for what is,
 * on our side, just a parameter we pass along. Intl also gives each name in the
 * reader's own language for free, which a hand-written list would owe twelve
 * translations for.
 *
 * The documented-supported ones sort first so the languages that actually
 * transcribe are not buried among the ones that fall back to English.
 */
export function listDictationLanguages(displayLocale: string): DictationLanguageOption[] {
  const names = new Intl.DisplayNames([displayLocale], { type: 'language', fallback: 'none' });
  const options: DictationLanguageOption[] = [];

  // ISO 639-1 is two letters, so the space is small enough to walk: anything
  // Intl can put a name to is a real language, and anything it cannot is not
  // worth offering since we could only label it with its own code.
  for (let a = 97; a <= 122; a++) {
    for (let b = 97; b <= 122; b++) {
      const code = String.fromCharCode(a) + String.fromCharCode(b);
      let label: string | undefined;
      try {
        label = names.of(code);
      } catch {
        continue;
      }
      if (!label || label === code) continue;
      options.push({ code, label, supported: SUPPORTED.has(code) });
    }
  }

  return options.sort((x, y) => {
    if (x.supported !== y.supported) return x.supported ? -1 : 1;
    return x.label.localeCompare(y.label, displayLocale);
  });
}

/**
 * Turn whatever the official `language` key holds into a BCP-47 code.
 *
 * The key is free text, so it may already be a code ('ko'), an English language
 * name ('korean' — the form our own interface-language setting uses), or
 * something we cannot read at all ('be concise'), which yields null so the
 * caller moves on to the next source rather than sending nonsense.
 */
export function languageSettingToCode(language: string | null | undefined): string | null {
  if (!language) return null;
  const trimmed = language.trim();
  if (!trimmed) return null;

  // An English name we already map for the interface language ('korean' → 'ko').
  const named = LANGUAGE_TO_LOCALE[trimmed.toLowerCase()];
  if (named) return named;

  // Otherwise it should already be a code. Accept only things shaped like one
  // ('ko', 'pt-BR', 'zh-Hant') so free-form instructions are rejected instead of
  // being passed through as a language tag.
  if (/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(trimmed)) return trimmed;

  return null;
}

/**
 * The language to transcribe in, or null to let the service decide.
 *
 * Order: our own `voice.speechLanguage`, then the official `language` setting,
 * then the interface language as a last guess — someone reading the UI in
 * Korean is far more likely to speak Korean than English.
 *
 * The official docs put `language` first and our setting second (the order the
 * VS Code extension uses). We deliberately invert those two, because the two
 * orders differ only when the user has explicitly picked a spoken language —
 * and at that point the documented order makes the control they just used do
 * nothing, with no indication why. Left unset, `speechLanguage` means "follow",
 * and the resolution below is exactly the documented one.
 *
 * This does not weaken CLI equivalence: the CLI has no spoken-language setting,
 * so nothing a CLI user can do is unreachable here — clearing the control
 * reproduces the CLI's behaviour precisely.
 */
export function resolveDictationLanguage(sources: {
  /** Claude's `language` setting, from the native settings file. */
  claudeLanguage?: string | null;
  /** Our `voice.speechLanguage`. */
  speechLanguage?: string | null;
  /** The active interface locale, already BCP-47. */
  uiLocale?: string | null;
}): string | null {
  const ours = languageSettingToCode(sources.speechLanguage);
  if (ours) return ours;

  const official = languageSettingToCode(sources.claudeLanguage);
  if (official) return official;

  // Already a locale ('ko'), so it is passed through rather than run through
  // toLocale — that maps setting values ('korean') and would answer 'en' for
  // every code handed to it, quietly turning Korean into English.
  return sources.uiLocale || null;
}
