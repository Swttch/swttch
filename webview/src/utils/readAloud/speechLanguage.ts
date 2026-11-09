/**
 * Which language a reply is in, as the code the speech service takes as a hint ("ko", "ja", ...), or undefined when
 * it cannot be told.
 *
 * The service reads Korean, Japanese and the like with an English voice's habits when it is not told, which is
 * what a foreigner reading Korean sounds like. The text is what decides, not the interface language: a reply can
 * be in another language than the one the interface is in. A script that belongs to one language settles it; Latin
 * text is left to the service, since "English" would be a guess for French or Spanish.
 */
export function speechLanguageOf(text: string): string | undefined {
  const counts: Record<string, number> = { ko: 0, ja: 0, zh: 0, ru: 0, ar: 0, fa: 0, hi: 0, th: 0, he: 0, el: 0 };
  let letters = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if ((code >= 0xac00 && code <= 0xd7a3) || (code >= 0x1100 && code <= 0x11ff) || (code >= 0x3130 && code <= 0x318f)) counts.ko++;
    else if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff)) counts.ja++;
    else if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) counts.zh++;
    else if (code >= 0x0400 && code <= 0x04ff) counts.ru++;
    else if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f)) counts.ar++;
    else if (code >= 0x0900 && code <= 0x097f) counts.hi++;
    else if (code >= 0x0e00 && code <= 0x0e7f) counts.th++;
    else if (code >= 0x0590 && code <= 0x05ff) counts.he++;
    else if (code >= 0x0370 && code <= 0x03ff) counts.el++;
    if (/\p{L}/u.test(character)) letters++;
  }
  // Japanese text mixes kana with Han characters, so kana is what tells it from Chinese.
  if (counts.ja > 0 && counts.ja + counts.zh >= counts.ko) return 'ja';
  let best: string | undefined;
  let most = 0;
  for (const [language, count] of Object.entries(counts)) {
    if (count > most) {
      most = count;
      best = language;
    }
  }
  // Persian and Arabic share a script; the service gets "ar" for both unless the text says otherwise.
  return most > 0 && most >= letters * 0.2 ? best : undefined;
}
