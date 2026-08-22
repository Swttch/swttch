/**
 * Recovery for Windows console output that is not UTF-8.
 *
 * Windows console programs (`tasklist`, `netstat`, `where`, ...) print their localized
 * messages in the system's legacy OEM codepage — CP949 on Korean Windows, CP936 on
 * Simplified Chinese, CP932 on Japanese — never UTF-8. Node decodes child stdout as UTF-8,
 * so every non-ASCII byte becomes U+FFFD and the text arrives unreadable.
 *
 * Scope: this covers output the BACKEND itself decodes. Output produced inside the Claude
 * CLI's own Bash tool is decoded by the CLI before it ever reaches us, so it cannot be
 * repaired here — that path is addressed by switching the console codepage at spawn time
 * (see `withUtf8ConsoleCodepage` in win-job.ts).
 */

/** The system locale, used to pick which legacy codepage to try. */
function systemLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale;
}

/**
 * The legacy decoders worth trying for [locale], most likely first.
 *
 * Deliberately keyed on the system language rather than hardcoding one market's codepage:
 * a Korean machine garbles in CP949 exactly as a Chinese one garbles in CP936, and picking
 * only the latter would leave every other CJK user with the same broken output.
 *
 * `cp949` is not a WHATWG encoding label; `euc-kr` is its registered superset name and is
 * what TextDecoder accepts for the same byte range.
 */
export function legacyDecoderCandidates(locale: string): string[] {
  const tag = String(locale || '').toLowerCase();
  const language = tag.split('-')[0];
  if (language === 'ko') return ['euc-kr'];
  if (language === 'ja') return ['shift_jis'];
  if (language === 'zh') {
    // Traditional-Chinese regions run CP950 (Big5); everything else CP936 (GBK).
    const traditional = /(^|-)(hant|tw|hk|mo)(-|$)/.test(tag);
    return traditional ? ['big5'] : ['gbk', 'gb18030'];
  }
  return ['windows-1252'];
}

/**
 * Decode console output, falling back to the system's legacy codepage when the bytes are
 * not valid UTF-8. A string passes through untouched (it was decoded upstream already).
 *
 * If nothing decodes cleanly the UTF-8 reading is returned as-is: a lossy result still
 * carries the ASCII parts (paths, PIDs, numbers) that callers usually parse, so degrading
 * is always better than throwing away the output.
 */
export function decodeConsoleOutput(value: Buffer | string, locale?: string): string {
  if (typeof value === 'string') return value;
  const utf8 = value.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;

  for (const label of legacyDecoderCandidates(locale ?? systemLocale())) {
    try {
      const decoded = new TextDecoder(label).decode(value);
      if (!decoded.includes('\uFFFD')) return decoded;
    } catch {
      // A Node built without full ICU cannot construct this decoder — try the next label.
    }
  }
  return utf8;
}
