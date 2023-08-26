const core = require('@actions/core');
const exec = require('@actions/exec');

const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// most @actions toolkit packages have async methods
async function run() {
  try {
    const odinVersion = core.getInput('odin-version');

    // TODO:
    // - caching
    // - nightly
    // - commit hashes
    // - if no need to build from source, don't
    // - build option, release|release_native|debug
    // - use odin fork

    // TODO: some temp dir.

    const odinPath = path.join(
      await fs.realpath(os.tmpdir()),
      'odin',
    );

    const gitExitCode = await exec.exec('git', [
      'clone',
      'https://github.com/odin-lang/Odin',
      odinPath,
      '--branch',
      odinVersion,
      '--depth=1',
      '--single-branch',
      '--no-tags',
    ]);
    // TODO: capture stderr.
    if (gitExitCode !== 0) {
      throw new Error(`Git clone failed with exit code: ${gitExitCode}`);
    }
  
    let pkgsExitCode;
    switch (os.platform()) {
    case 'darwin':
        pkgsExitCode = await exec.exec('brew', [
          'install',
          'llvm@14',
        ]);
        core.addPath('/usr/local/opt/llvm@14/bin');
        break;
    case 'linux':
        pkgsExitCode = await exec.exec('sudo', [
          'apt-get',
          'install',
          'llvm-11',
          'clang-11',
        ]);
        break;
    case 'win32':
        pkgsExitCode = 0;
        break;
    default:
        throw new Error(`Operating system ${os.platform()} is not supported by setup-odin`);
    }
    if (pkgsExitCode !== 0) {
      throw new Error(`Installing Odin dependencies failed with exit code: ${pkgsExitCode}`);
    }

    let buildExitCode;
    switch (os.platform()) {
      case 'darwin':
      case 'linux':
        buildExitCode = await exec.exec('./build_odin.sh', undefined, {
          cwd: odinPath,
        });
        break;
      case 'win32':
        buildExitCode = await exec.exec('./build.bat', undefined, {
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

run();
