const core = require('@actions/core');
const exec = require('@actions/exec');

const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// most @actions toolkit packages have async methods
async function run() {
  try {
    const odinVersion = core.getInput('odin-version');
    const llvmVersion = core.getInput('llvm-version');
    const buildType   = core.getInput('build-type');
    const repository  = core.getInput('repository');

    if (!['', 'debug', 'release', 'release_native'].includes(buildType)) {
      throw new Error(`Given build-type "${buildType}" is not supported, use "debug", "release" or "release_native"`);
    }

    if (!['11', '12', '13', '14'].includes(llvmVersion)) {
      throw new Error(`Given llvm-version "${llvmVersion}" is not supported, use "11", "12", "13" or "14"`);
    }

    // TODO:
    // - caching
    // - nightly
    // - commit hashes
    // - if no need to build from source, don't
    // - use odin fork

    const [odinPath, ] = await Promise.all([
      pullOdin(repository, odinVersion),
      pullOdinBuildDependencies(llvmVersion),
    ]);

    let buildExitCode;
    switch (os.platform()) {
      case 'darwin':
      case 'linux':
        buildExitCode = await exec.exec('./build_odin.sh', [buildType], {
          cwd: odinPath,
        });
        break;
      case 'win32':
        buildExitCode = await exec.exec('./build.bat', [buildType], {
          cwd: odinPath,
        });
        break;
    }
    if (buildExitCode !== 0) {
      throw new Error(`Building Odin failed with exit code: ${buildExitCode}`);
    }

    core.addPath(odinPath);

    core.info('Successfully set up Odin compiler');
  } catch (error) {
    core.setFailed(error.message);
  }
}

/**
  * @param repository {string} The git repository to find Odin.
  * @param version {string} The version of Odin to pull.
  *
  * @return {Promise<string>} The directory that Odin is pulled into.
  */
async function pullOdin(repository, version) {
  const odinPath = path.join(
    await fs.realpath(os.tmpdir()),
    'odin',
  );

  const code = await exec.exec('git', [
    'clone',
    repository,
    odinPath,
    '--branch',
    version,
    '--depth=1',
    '--single-branch',
    '--no-tags',
  ]);

  if (code !== 0) {
    throw new Error(`Git clone failed with exit code: ${code}, are you sure that version exists?`);
  }

  return odinPath;
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
        'apt-get',
        'install',
        `llvm-${llvm}`,
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
