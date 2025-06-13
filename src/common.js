const core = require('@actions/core');
const cache = require('@actions/cache');

const path = require('path');
const os = require('os');

/**
 * @typedef {Object} Inputs
 * @property {string} token
 * @property {'latest'|string} release
 * @property {string} branch
 * @property {string} llvmVersion
 * @property {''|'debug'|'release'|'release-native'} buildType
 * @property {string} repository
 * @property {bool} cacheEnabled
 */

/**
 * @return {Inputs}
 */
function getInputs() {
  const token        = core.getInput('token');
  let release        = core.getInput('release');
  let branch         = core.getInput('branch');
  const llvmVersion  = core.getInput('llvm-version');
  let buildType      = core.getInput('build-type');
  const repository   = core.getInput('repository');
  const cacheEnabled = core.getBooleanInput('cache');

  if (!['', 'debug', 'release', 'release_native', 'release-native'].includes(buildType)) {
    throw new Error(`Given build-type "${buildType}" is not supported, use "debug", "release" or "release_native"`);
  }

  if (buildType == 'release_native' || buildType == 'release-native') {
    if (os.platform() == 'win32') {
      // Windows does not have release-native.
      buildType = 'release';
    } else {
      buildType = 'release-native';
    }
  }

  // In case the release isn't available we want to fallback to building that branch from source.
  if (release && release.length > 0) {
    if (release == "false" || release == "False" || release == "FALSE") {
      release = "";
    } else {
      branch = release;
    }
  }

  if (cacheEnabled) {
    core.warning('The `cache` options has been deprecated because it is most likely slower than just downloading the release or even building from source. If you think this is a bad decision please file a GitHub issue to discuss.');
  }

  return {
    token,
    release,
    branch,
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
function mainCacheKey(i) {
  return `${os.platform()}-${os.arch()}-${i.repository}-${i.branch}-${i.release}-${i.buildType}-llvm_${i.llvmVersion}`;
}

/**
 * @param i {Inputs}
 *
 * @return {bool}
 */
function cacheCheck(i) {
  if (!i.cacheEnabled) {
    return false;
  }

  if (!cache.isFeatureAvailable()) {
    core.info('The caching feature is not available');
    return false;
  }

  return true;
}

/**
 * @param inputs {Inputs}
 *
 * @return {string}
 */
function darwinCacheKey(inputs) {
  return `${os.platform()}-llvm_${inputs.llvmVersion}`;
}

/**
 * @param inputs {Inputs}
 *
 * @return {string[]}
 */
function darwinCachePaths(inputs) {
  const cachePath = path.join(os.homedir(), 'Library', 'Caches', 'Homebrew');
  return [
    `${cachePath}/llvm@${inputs.llvmVersion}--*`,
    `${cachePath}/downloads/*--llvm@${inputs.llvmVersion}-*`,
  ];
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
  mainCacheKey,
  cacheCheck,
  odinPath,
  darwinCacheKey,
  darwinCachePaths,
};
