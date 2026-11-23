import { SettingSection } from '../../common';
import { ColorThemeRow } from './ColorThemeRow';
import { FontSizeRow } from './FontSizeRow';
import { ChatFontRow, CodeFontRow } from './FontFamilyRow';
import { LineSpacingRow } from './LineSpacingRow';
import { SoftWrapRow } from './SoftWrapRow';

/**
 * How the interface looks: its colours, its type, and how long lines behave.
 *
 * Untitled, because the page's own heading already says Appearance and a
 * subtitle repeating it would add a line without adding a distinction.
 */
export function ThemeSection() {
  return (
    <SettingSection>
      <ColorThemeRow />
      <FontSizeRow />
      <LineSpacingRow />
      <ChatFontRow />
      <CodeFontRow />
      <SoftWrapRow />
    </SettingSection>
  );
}
