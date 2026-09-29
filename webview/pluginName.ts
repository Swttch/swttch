import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * The plugin's marketplace name, read from `pluginName` in the root
 * gradle.properties. That line is the single source: the Gradle build writes it
 * into plugin.xml and into the IDE-side resources, and the vite/vitest configs
 * inject it into the webview as `__PLUGIN_NAME__`. Renaming the plugin is then
 * one edit, and no copy of the name can drift from the others.
 */
export function readPluginName(): string {
  const properties = readFileSync(resolve(__dirname, '..', 'gradle.properties'), 'utf-8');
  const match = /^pluginName=(.+)$/m.exec(properties);
  if (!match) throw new Error('pluginName is missing from gradle.properties');
  return match[1].trim();
}
