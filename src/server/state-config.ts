/**
 * Config Management - load/save config and tsconfig handling
 */

import * as fs from 'fs';
import * as path from 'path';
import { ServerConfig } from './state-types';

export class ConfigManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), '.consolidator-config.json');
  }

  load(): ServerConfig | null {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        console.log('Loaded config from', this.configPath);
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Failed to load config:', e);
    }
    return null;
  }

  save(config: ServerConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    console.log('Saved config to', this.configPath);
  }
}

/**
 * Parse a tsconfig file (handles JSON5 - comments, trailing commas)
 */
export function parseTsconfig(tsconfigPath: string): any {
  const content = fs.readFileSync(tsconfigPath, 'utf-8');
  const strings: string[] = [];

  // Preserve strings while stripping comments
  let cleaned = content.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    const idx = strings.length;
    strings.push(match);
    return `__STRING_${idx}__`;
  });

  // Remove comments
  cleaned = cleaned.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // Restore strings
  cleaned = cleaned.replace(/__STRING_(\d+)__/g, (_, idx) => strings[parseInt(idx)]);

  // Remove trailing commas
  cleaned = cleaned.replace(/,(\s*[\}\]])/g, '$1');

  return JSON.parse(cleaned);
}

/**
 * Ensure merged aliases exist in a tsconfig file
 * Returns a map of original aliases to merged aliases
 */
export function ensureMergedAliasesForTsconfig(
  tsconfigPath: string,
  branchName: string,
  emit: (line: string) => void
): Record<string, string> {
  emit(`  Checking ${branchName} tsconfig: ${path.basename(tsconfigPath)}`);

  const tsconfig = parseTsconfig(tsconfigPath);
  const paths = tsconfig.compilerOptions?.paths || {};

  const aliasMap: Record<string, string> = {};
  const newPaths: Record<string, string[]> = { ...paths };
  let modified = false;

  for (const [alias, targets] of Object.entries(paths)) {
    // Skip if already a merged alias or external
    if (alias.includes('Merged') || alias === 'shared/*') continue;

    // Create merged version: @app/* -> @appMerged/*
    const baseName = alias.replace('@', '').replace('/*', '');
    const mergedAlias = `@${baseName}Merged/*`;

    aliasMap[alias] = mergedAlias;

    // Add merged alias if not already present
    if (!paths[mergedAlias]) {
      const originalTarget = (targets as string[])[0];
      const mergedTarget = `../../merged/src/${originalTarget}`;

      newPaths[mergedAlias] = [mergedTarget];
      modified = true;
      emit(`    Adding alias: ${mergedAlias} -> ${mergedTarget}`);
    }
  }

  // Write updated tsconfig if modified
  if (modified) {
    tsconfig.compilerOptions = tsconfig.compilerOptions || {};
    tsconfig.compilerOptions.paths = newPaths;
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
    emit(`    Updated ${branchName} tsconfig`);
  } else {
    emit(`    ${branchName} tsconfig already has merged aliases`);
  }

  return aliasMap;
}

/**
 * Ensure merged aliases exist in BOTH retail and restaurant tsconfigs
 */
export function ensureMergedAliases(
  config: ServerConfig,
  emit: (line: string) => void
): Record<string, string> {
  emit('Adding @appMerged/* aliases to both tsconfigs...');

  const restaurantTsconfig = path.join(config.projectPath, 'apps/restaurant/tsconfig.app.json');
  const retailTsconfig = path.join(config.projectPath, 'apps/retail/tsconfig.app.json');

  // Update restaurant tsconfig
  const aliasMap = ensureMergedAliasesForTsconfig(
    fs.existsSync(restaurantTsconfig) ? restaurantTsconfig : config.tsconfigPath,
    'restaurant',
    emit
  );

  // Update retail tsconfig if it exists
  if (fs.existsSync(retailTsconfig)) {
    ensureMergedAliasesForTsconfig(retailTsconfig, 'retail', emit);
  } else {
    emit(`  Retail tsconfig not found at ${retailTsconfig}, skipping`);
  }

  return aliasMap;
}
