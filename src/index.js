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

    await Promise.all([
      pullOdin(inputs.repository, inputs.odinVersion),
      pullOdinBuildDependencies(inputs.llvmVersion),
    ]);

    if (common.cacheCheck(inputs)) {
      const key = await common.composeCacheKey(inputs);
      const restoredKey = await cache.restoreCache(common.cachePaths(), key);

      if (key === restoredKey) {
        core.info('Cache HIT');
        core.setOutput('cache-hit', true);
        core.saveState('cache-hit', 'true');
        core.info('Successfully set up Odin compiler');
        return;
      }
    }

    core.info('Cache MISS');
    core.setOutput('cache-hit', false);
  
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
