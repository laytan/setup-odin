const core = require('@actions/core');
const cache = require('@actions/cache');

const path = require('path');
const os = require('os');

/**
 * @typedef {Object} Inputs
 * @property {string} odinVersion
 * @property {string} llvmVersion
 * @property {''|'debug'|'release'|'release_native'} buildType
 * @property {string} repository
 * @property {bool} cacheEnabled
 */

/**
 * @return {Inputs}
 */
function getInputs() {
  const odinVersion  = core.getInput('odin-version');
  const llvmVersion  = core.getInput('llvm-version');
  const buildType    = core.getInput('build-type');
  const repository   = core.getInput('repository');
  const cacheEnabled = core.getBooleanInput('cache');

  if (!['', 'debug', 'release', 'release_native'].includes(buildType)) {
    throw new Error(`Given build-type "${buildType}" is not supported, use "debug", "release" or "release_native"`);
  }

  if (!['11', '12', '13', '14'].includes(llvmVersion)) {
    throw new Error(`Given llvm-version "${llvmVersion}" is not supported, use "11", "12", "13" or "14"`);
  }

  return {
    odinVersion,
    llvmVersion,
    buildType,
    repository,
    cacheEnabled,
  }; 
}

/**
 * @param i {Inputs}
 *
 * @return {string}
 */
function composeCacheKey(i) {
  return `${os.platform()}-${i.repository}-${i.odinVersion}-${i.buildType}-llvm_${i.llvmVersion}`;
}

/**
 * @param i {Inputs}
 *
 * @return {bool}
 */
function cacheCheck(i) {
  if (!i.cacheEnabled) {
    core.info('Caching is disabled via options');
    return false;
  }

  if (!cache.isFeatureAvailable()) {
    core.info('The caching feature is not available');
    return false;
  }

  return true;
}

/**
 * @return {string[]}
 */
function cachePaths() {
  return [odinPath()];
}

let _cachedOdinPath;

/**
 * @return {string}
 */
function odinPath() {
  if (_cachedOdinPath) {
    return _cachedOdinPath;
  }

  _cachedOdinPath = path.join(
    os.homedir(),
    'odin',
  );

  return _cachedOdinPath;
}

module.exports = {
  getInputs,
  composeCacheKey,
  cacheCheck,
  odinPath,
  cachePaths,
};
