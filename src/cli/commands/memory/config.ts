/**
 * aide-memory config <key> [value] — Get or set configuration.
 *
 * Reads/writes `.aide/config.json` with dot-notation keys.
 * Example: aide-memory config capture.enabled false
 */

import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { requireProjectRoot } from './utils';

function getConfigPath(projectRoot: string): string {
  return path.join(projectRoot, '.aide', 'config.json');
}

function readConfig(configPath: string): Record<string, any> {
  if (!fs.existsSync(configPath)) {
    return {};
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

function writeConfig(configPath: string, config: Record<string, any>): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Get a value by dot-notation key from a nested object.
 */
function getNestedValue(obj: Record<string, any>, key: string): any {
  const parts = key.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Set a value by dot-notation key in a nested object.
 */
function setNestedValue(obj: Record<string, any>, key: string, value: any): void {
  const parts = key.split('.');
  let current: any = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Try to parse a string value into a more appropriate type.
 */
function parseValue(raw: string): any {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  const num = Number(raw);
  if (!isNaN(num) && raw.trim() !== '') return num;
  return raw;
}

export function runConfig(key: string, value?: string): void {
  const projectRoot = requireProjectRoot();
  const configPath = getConfigPath(projectRoot);
  const config = readConfig(configPath);

  if (value === undefined) {
    // GET mode
    const result = getNestedValue(config, key);
    if (result === undefined) {
      console.log(chalk.gray(`(not set)`));
    } else {
      console.log(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
    }
  } else {
    // SET mode
    const parsed = parseValue(value);
    setNestedValue(config, key, parsed);
    writeConfig(configPath, config);
    console.log(chalk.green(`Set ${key} = ${JSON.stringify(parsed)}`));
  }
}
