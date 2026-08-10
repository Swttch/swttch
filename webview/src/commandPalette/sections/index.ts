// Section definitions
export { ContextSection } from './context/ContextSection';
export { ModelSection } from './model/ModelSection';
export { CustomizeSection } from './customize/CustomizeSection';
export { SlashCommandsSection, ClearCommand, UsageCommand, CliPassthroughCommand, ModelSlashCommand, ControlRequestSlashCommand, buildControlRequestCommands } from './slashCommands';
export { SettingsSection } from './settings/SettingsSection';
export { SupportSection } from './support/SupportSection';

// Section item factories (built on demand so labels resolve on the current
// locale after i18n init, not captured at module load).
export { getContextItems } from './context/items';
export { getModelItems } from './model';
export { getCustomizeItems } from './customize/items';
export { getSettingsItems } from './settings/items';
export { getSupportItems } from './support/items';
