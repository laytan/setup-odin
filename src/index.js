const exec = require('@actions/exec');
const core = require('@actions/core');
const cache = require('@actions/cache');

const os = require('os');

const common = require('./common');

// most @actions toolkit packages have async methods
async function run() {
  try {
    const inputs = common.getInputs();

    const odinPath = common.odinPath();
    core.addPath(odinPath);

    if (common.cacheCheck(inputs)) {
      const [cacheSuccess, ] = await Promise.all([
        restoreCache(inputs, odinPath),
        pullOdinBuildDependencies(inputs.llvmVersion),
      ]);

      if (cacheSuccess) {
        return;
      }
    } else {
      await Promise.all([
        pullOdin(inputs.repository, inputs.odinVersion),
        pullOdinBuildDependencies(inputs.llvmVersion),
      ]);
    }

    core.setOutput('cache-hit', false);
    core.saveState('cache-hit', 'false');
  
    let buildExitCode;
    switch (os.platform()) {
      case 'darwin':
      case 'linux':
        buildExitCode = await exec.exec('./build_odin.sh', [inputs.buildType], {
          cwd: odinPath,
          // env: {
          //   'LLVM_CONFIG': `llvm-config-${inputs.llvmVersion}`,
          //   'CXX':         `clang++-${inputs.llvmVersion}`,
          // },
        });
        break;
      case 'win32':
        buildExitCode = await exec.exec('./build.bat', [inputs.buildType], {
          cwd: odinPath,
        });
        break;
    }
    if (buildExitCode !== 0) {
      throw new Error(`Building Odin failed with exit code: ${buildExitCode}`);
    }

    core.info('Successfully set up Odin compiler');
  } catch (error) {
    core.setFailed(error.message);
  }
}

/**
 * @param inputs {common.Inputs}
 * @param odinPath {string}
 *
 * @return {Promise<bool>} If the cache was hit.
 */
async function restoreCache(inputs, odinPath) {
  const key = common.composeCacheKey(inputs);
  const restoredKey = await cache.restoreCache(common.cachePaths(), key);
  if (key === restoredKey) {
    core.info('Cache HIT, checking if it is still up-to-date');

    if (await pullUpdates(odinPath, inputs.odinVersion)) {
      core.info('Cache is still up-to-date');
      core.setOutput('cache-hit', true);
      core.saveState('cache-hit', 'true');
      core.info('Successfully set up Odin compiler');
      return true;
    }

    core.info('Cache is not up-to-date, rebuilding the compiler now');
    return false;
  }
  
  core.info('Cache MISS');
  await pullOdin(inputs.repository, inputs.odinVersion);
  return false;
}

/**
  * @param repository {string} The git repository to find Odin.
  * @param version {string} The version of Odin to pull.
  *
  * @return {Promise<void>}
  */
async function pullOdin(repository, version) {
  const code = await exec.exec('git', [
    'clone',
    repository,
    common.odinPath(),
    '--branch',
    version,
    '--depth=1',
    '--single-branch',
    '--no-tags',
  ]);

  if (code !== 0) {
    throw new Error(`Git clone failed with exit code: ${code}, are you sure that version exists?`);
  }
}

/**
 * @param path {string} The path to the git repo.
 * @param version {string} The version to check.
 *
 * @return {Promise<bool>} Whether it was already up-to-date.
 */
async function pullUpdates(path, version) {
  const output = await exec.getExecOutput(
    'git',
    [
      'pull',
      'origin',
      version,
    ],
    {
      cwd: path,
    },
  );

  return output.stdout.includes('Already up to date.');
}

/**
  * @param llvm {string} The version of LLVM to pull.
  *
  * @return Promise<void>
  */
async function pullOdinBuildDependencies(llvm) {
  let code;
  switch (os.platform()) {
  case 'darwin':
      code = await exec.exec('brew', [
        'install',
        `llvm@${llvm}`,
      ]);
      core.addPath(`/usr/local/opt/llvm@${llvm}/bin`);
      break;
  case 'linux':
      code = await exec.exec('sudo', [
        'apt-fast',
        'install',
        `llvm-${llvm}-dev`,
        `clang-${llvm}`,
      ]);
      break;
  case 'win32':
      code = 0;
      break;
  default:
      throw new Error(`Operating system ${os.platform()} is not supported by setup-odin`);
  }

  if (code !== 0) {
    throw new Error(`Installing Odin dependencies failed with exit code: ${code}`);
  }
}

run();
