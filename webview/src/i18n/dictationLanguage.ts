/**
 * Which language the transcription service should listen for.
 *
 * Claude Code has no dedicated dictation-language setting: its `language` key —
 * the one that decides what language Claude replies in — doubles as the
 * dictation language, and accepts either a BCP-47 code ('ja') or a plain name
 * ('japanese'). That key is authoritative here for the same reason it is in the
 * CLI, so this module resolves it first and only then falls back.
 *
 * The fallback exists because the two genuinely come apart: someone can have
 * Claude answer in English while speaking Korean. The docs give VS Code exactly
 * this arrangement — `language` first, then the extension's own
 * `accessibility.voice.speechLanguage`, then English — and ours mirrors it.
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
 * Order: the official `language` setting, then our own `voice.speechLanguage`,
 * then the interface language as a last guess — someone reading the UI in
 * Korean is far more likely to speak Korean than English.
 */
export function resolveDictationLanguage(sources: {
  /** Claude's `language` setting, from the native settings file. */
  claudeLanguage?: string | null;
  /** Our `voice.speechLanguage`. */
  speechLanguage?: string | null;
  /** The active interface locale, already BCP-47. */
  uiLocale?: string | null;
}): string | null {
  const official = languageSettingToCode(sources.claudeLanguage);
  if (official) return official;

  const ours = languageSettingToCode(sources.speechLanguage);
  if (ours) return ours;

  // Already a locale ('ko'), so it is passed through rather than run through
  // toLocale — that maps setting values ('korean') and would answer 'en' for
  // every code handed to it, quietly turning Korean into English.
  return sources.uiLocale || null;
}
