/**
 * `{{name}}` placeholders inside a saved prompt.
 *
 * A saved phrase is rarely reusable word for word: "review this diff for X"
 * wants a different X every time. Writing the varying part as `{{focus}}` lets
 * the same prompt be saved once and filled in at the moment it is inserted.
 *
 * The syntax is deliberately narrow. A name may not contain a brace, so the
 * braces in a prompt that talks about JSON or about a template language are left
 * alone, and an unclosed `{{` is simply not a placeholder.
 */

/** `{{name}}`, where the name is anything but a brace and is not empty. */
const PLACEHOLDER = /\{\{([^{}]+)\}\}/g;

/**
 * The placeholder names in [content], de-duplicated, in first-appearance order.
 *
 * Names are trimmed, so `{{ focus }}` and `{{focus}}` are the same variable and
 * are asked for once. A placeholder whose name is only whitespace is not a
 * variable and is left in the text as written.
 */
export function parsePromptVariables(content: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const match of content.matchAll(PLACEHOLDER)) {
    const name = match[1].trim();
    if (name === '' || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/**
 * Replace every `{{name}}` in [content] with its value from [values].
 *
 * Substitution is single-pass, so a value that itself contains `{{...}}` is
 * inserted as text rather than being filled in again. A name with no entry in
 * [values] is left as written, which keeps an unanswered placeholder visible in
 * the composer instead of silently blanking it.
 */
export function fillPromptVariables(
  content: string,
  values: Record<string, string>,
): string {
  return content.replace(PLACEHOLDER, (whole, rawName: string) => {
    const name = rawName.trim();
    if (name === '') return whole;
    const value = values[name];
    return value === undefined ? whole : value;
  });
}
