import { SettingSection } from '../../common';
import { DefaultModelRow } from './DefaultModelRow';
import { SyncToDefaultRow } from './SyncToDefaultRow';

/**
 * Which model a new session starts on, and whether changing one session's model
 * moves that default.
 *
 * Untitled, because the page's own heading already says Model.
 */
export function DefaultsSection() {
  return (
    <SettingSection>
      <DefaultModelRow />
      <SyncToDefaultRow />
    </SettingSection>
  );
}
