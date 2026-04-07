import fs from 'fs';
import path from 'path';

/**
 * Default configuration for AIDE Memory.
 * This is the canonical source of truth for all config keys and their types.
 */
const DEFAULT_CONFIG = {
  version: 1,
  capture: {
    enabled: true,
    hooks: {
      preToolUse: true,
      stop: true,
      userPromptSubmit: true,
      preCompact: true,
    },
  },
  nudge: {
    visible: false,
  },
  tags: {
    presets: [
      'architecture',
      'testing',
      'security',
      'style',
      'integration',
      'config',
      'migration',
      'performance',
      'api-contract',
    ],
  },
  telemetry: {
    enabled: true,
  },
  contributor: 'auto' as string,
  embeddings: {
    model: 'bge-small-en-v1.5' as string,
    backend: 'transformers' as string,
  },
  updates: {
    check: true,
  },
};

export type AideConfigData = typeof DEFAULT_CONFIG;

/**
 * Schema defining valid config keys and their expected types.
 * Built from DEFAULT_CONFIG at module load time.
 */
interface SchemaEntry {
  type: 'boolean' | 'string' | 'number' | 'object' | 'array';
}

function buildSchema(obj: Record<string, any>, prefix: string = ''): Map<string, SchemaEntry> {
  const schema = new Map<string, SchemaEntry>();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      schema.set(fullKey, { type: 'array' });
    } else if (value !== null && typeof value === 'object') {
      schema.set(fullKey, { type: 'object' });
      const nested = buildSchema(value, fullKey);
      for (const [nk, nv] of nested) {
        schema.set(nk, nv);
      }
    } else {
      schema.set(fullKey, { type: typeof value as 'boolean' | 'string' | 'number' });
    }
  }
  return schema;
}

const CONFIG_SCHEMA = buildSchema(DEFAULT_CONFIG);

/**
 * Get a nested value from an object using dot-notation.
 */
function getByPath(obj: any, dotPath: string): any {
  const parts = dotPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Set a nested value on an object using dot-notation.
 * Creates intermediate objects as needed.
 */
function setByPath(obj: any, dotPath: string, value: any): void {
  const parts = dotPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Deep clone a plain JSON-compatible object.
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * AideConfig manages the .aide/config.json configuration file.
 *
 * - Loads from .aide/config.json on construction, falling back to defaults if missing.
 * - Validates keys and value types on set().
 * - Saves to disk on every mutation (set, addTag, removeTag, reset).
 * - Handles corrupted JSON gracefully: logs a warning and uses defaults.
 */
export class AideConfig {
  private config: AideConfigData;
  private configPath: string;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.configPath = path.join(projectRoot, '.aide', 'config.json');
    this.config = this.load();
  }

  /**
   * Get a config value using dot-notation.
   * Example: config.get('capture.hooks.preToolUse') => true
   */
  get(key: string): any {
    return getByPath(this.config, key);
  }

  /**
   * Set a config value using dot-notation and save to disk.
   * Validates that the key exists in the schema and the value type matches.
   * Throws on unknown keys or type mismatches.
   */
  set(key: string, value: any): void {
    this.validateKey(key);
    this.validateValue(key, value);
    setByPath(this.config, key, value);
    this.save();
  }

  /**
   * Add a tag to tags.presets if not already present.
   */
  addTag(tag: string): void {
    const presets = this.config.tags.presets;
    if (!presets.includes(tag)) {
      presets.push(tag);
      this.save();
    }
  }

  /**
   * Remove a tag from tags.presets if present.
   */
  removeTag(tag: string): void {
    const presets = this.config.tags.presets;
    const index = presets.indexOf(tag);
    if (index !== -1) {
      presets.splice(index, 1);
      this.save();
    }
  }

  /**
   * Reset all configuration to defaults and save to disk.
   */
  reset(): void {
    this.config = deepClone(DEFAULT_CONFIG) as AideConfigData;
    this.save();
  }

  /**
   * Return the full config object (deep copy to prevent external mutation).
   */
  list(): object {
    return deepClone(this.config);
  }

  /**
   * Return the default config object (deep copy).
   */
  static defaults(): object {
    return deepClone(DEFAULT_CONFIG);
  }

  /**
   * Load config from disk, falling back to defaults.
   */
  private load(): AideConfigData {
    if (!fs.existsSync(this.configPath)) {
      return deepClone(DEFAULT_CONFIG) as AideConfigData;
    }

    let raw: string;
    try {
      raw = fs.readFileSync(this.configPath, 'utf-8');
    } catch {
      console.warn(`[aide-config] Could not read ${this.configPath}, using defaults`);
      return deepClone(DEFAULT_CONFIG) as AideConfigData;
    }

    try {
      const parsed = JSON.parse(raw);
      // Merge parsed config over defaults to fill any missing keys
      return this.mergeWithDefaults(parsed);
    } catch {
      console.warn(
        `[aide-config] Malformed JSON in ${this.configPath}, using defaults. ` +
        `Call config.reset() to overwrite the file with valid defaults.`
      );
      return deepClone(DEFAULT_CONFIG) as AideConfigData;
    }
  }

  /**
   * Deep-merge a partial config over defaults, so missing keys get filled in.
   */
  private mergeWithDefaults(partial: any): AideConfigData {
    const defaults = deepClone(DEFAULT_CONFIG);
    return this.deepMerge(defaults, partial) as AideConfigData;
  }

  /**
   * Recursively merge source into target. Source values overwrite target values.
   * Only merges plain objects; arrays and primitives are replaced wholesale.
   */
  private deepMerge(target: any, source: any): any {
    if (source === null || source === undefined) return target;
    if (typeof source !== 'object' || Array.isArray(source)) return source;
    if (typeof target !== 'object' || Array.isArray(target)) return source;

    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (key in result && typeof result[key] === 'object' && !Array.isArray(result[key])
          && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  /**
   * Save current config to .aide/config.json, creating directories as needed.
   */
  private save(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2) + '\n', 'utf-8');
  }

  /**
   * Validate that a dot-notation key exists in the config schema.
   */
  private validateKey(key: string): void {
    if (!CONFIG_SCHEMA.has(key)) {
      const validKeys = Array.from(CONFIG_SCHEMA.keys())
        .filter(k => !CONFIG_SCHEMA.get(k)!.type.startsWith('object'))
        .sort();
      throw new Error(
        `Unknown config key: "${key}". Valid keys: ${validKeys.join(', ')}`
      );
    }
  }

  /**
   * Validate that a value matches the expected type for a given key.
   */
  private validateValue(key: string, value: any): void {
    const entry = CONFIG_SCHEMA.get(key);
    if (!entry) return; // already validated in validateKey

    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (entry.type !== actualType) {
      throw new Error(
        `Invalid value type for "${key}": expected ${entry.type}, got ${actualType}`
      );
    }
  }
}
