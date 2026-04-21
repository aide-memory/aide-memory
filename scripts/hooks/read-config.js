// Shared settings reader for JS hooks. Mirrors read-config.sh semantics.
//
// Lookup order:
//   1. If the key is not in defaults.json → undefined
//   2. If the key is public:false          → defaults value
//   3. If user .aide/config.json sets the nested key → user value
//   4. Otherwise → defaults value
//
// defaults.json uses flat dot-path keys ("hooks.stop.schedule").
// .aide/config.json uses nested JSON ({"hooks":{"stop":{"schedule":...}}}).
// This module splits the flat key and walks the nested user config.

const fs = require('fs');
const path = require('path');

const HOOKS_DIR = __dirname;
const DEFAULTS_FILE = path.join(HOOKS_DIR, 'defaults.json');

let _defaultsCache = null;
function loadDefaults() {
  if (_defaultsCache) return _defaultsCache;
  try {
    _defaultsCache = JSON.parse(fs.readFileSync(DEFAULTS_FILE, 'utf8'));
  } catch {
    _defaultsCache = {};
  }
  return _defaultsCache;
}

function _hasNested(obj, parts) {
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object' || Array.isArray(cur)) {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return false;
    cur = cur[p];
  }
  return true;
}

function _getNested(obj, parts) {
  let cur = obj;
  for (const p of parts) {
    cur = cur[p];
  }
  return cur;
}

/**
 * Resolve one setting for the given projectRoot.
 * Returns undefined if the key doesn't exist in defaults.
 */
function getSetting(projectRoot, key) {
  const defaults = loadDefaults();
  const entry = defaults[key];
  if (!entry) return undefined;

  const defaultValue = entry.value;
  if (entry.public !== true) return defaultValue;

  const userConfigPath = path.join(projectRoot, '.aide', 'config.json');
  if (!fs.existsSync(userConfigPath)) return defaultValue;

  let userConfig;
  try {
    userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
  } catch {
    return defaultValue;
  }

  const parts = key.split('.');
  if (!_hasNested(userConfig, parts)) return defaultValue;

  return _getNested(userConfig, parts);
}

module.exports = { getSetting, loadDefaults };
