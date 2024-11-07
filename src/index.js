const exec = require('@actions/exec');
const core = require('@actions/core');
const cache = require('@actions/cache');
const io = require('@actions/io');
const github = require('@actions/github');
const AdmZip = require('adm-zip');
const fs = require('fs');
const tar = require('tar');

const os = require('os');

const common = require('./common');

// most @actions toolkit packages have async methods
async function run() {
  try {
    const inputs = common.getInputs();
    // const inputs = {
    //   branch:     'master',
    //   repository: 'github.com/odin-lang/Odin',
    // };

    const odinPath = common.odinPath();
    core.addPath(odinPath);

    if (inputs.release !== "" && await downloadRelease(inputs)) {
      core.setOutput('cache-hit', false);
      core.saveState('cache-hit', 'false');
      return;
    }

    if (common.cacheCheck(inputs)) {
      const [cacheSuccess, ] = await Promise.all([restoreCache(inputs, odinPath), pullOdinBuildDependencies(inputs)]);
      if (cacheSuccess) {
        return;
      }
    } else {
      await Promise.all([pullOdin(inputs.repository, inputs.branch), pullOdinBuildDependencies(inputs)]);
    }

    core.setOutput('cache-hit', false);
    core.saveState('cache-hit', 'false');
  
    let buildExitCode;
    switch (os.platform()) {
      case 'darwin':
      case 'linux':
        buildExitCode = await exec.exec('./build_odin.sh', [inputs.buildType], {
          cwd: odinPath,
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
  const key = common.mainCacheKey(inputs);
  core.info(`Main cache key: ${key}`);

  const restoredKey = await cache.restoreCache([odinPath], key);
  if (key === restoredKey) {
    core.info('Main cache HIT, checking if it is still up-to-date');

    if (await pullUpdates(odinPath, inputs.branch)) {
      core.info('Main cache is still up-to-date');
      core.setOutput('cache-hit', true);
      core.saveState('cache-hit', 'true');
      core.info('Successfully set up Odin compiler');
      return true;
    }

    core.info('Main cache is not up-to-date, rebuilding the compiler now');
    return false;
  }
  
  core.info('Main cache MISS');
  await pullOdin(inputs.repository, inputs.branch);
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
  * @param inputs {common.Inputs}
  *
  * @return Promise<void>
  */
async function pullOdinBuildDependencies(inputs) {
  const { llvmVersion: llvm } = inputs;

  let code;

  const platform = os.platform();
  switch (platform) {
  case 'darwin': {
      if (common.cacheCheck(inputs)) {
        const key = common.darwinCacheKey(inputs);
        core.info(`LLVM/Brew cache key: ${key}`);
        if ((await cache.restoreCache(common.darwinCachePaths(inputs), key)) === key) {
          core.info('Got LLVM/Brew install caches');
          core.saveState('darwin-cache-hit', 'true');
        } else {
          core.info('Cache MISS on LLVM/Brew install caches');
          core.saveState('darwin-cache-hit', 'false');
        }
      }

      code = await exec.exec('brew', [
        'install',
        `llvm@${llvm}`,
      ]);
    
      // arm64.
      core.addPath(`/opt/homebrew/opt/llvm@${llvm}/bin`);
      // x64.
      core.addPath(`/usr/local/opt/llvm@${llvm}/bin`);

      break;
  }
  case 'linux': {
      core.addPath(`/usr/lib/llvm-${llvm}/bin`);

      const preInstalled = fs.existsSync(`/usr/lib/llvm-${llvm}/bin`);
      if (preInstalled) {
        core.info(`LLVM ${llvm} comes pre-installed on this runner`);
        code = 0;
      } else {
        const checkCode = (message) => {
          return async (code) => {
            if (code !== 0) {
              throw new Error(`${message}, code: ${code}`);
            }
          };
        };

        await exec.exec('sudo', ['apt-key', 'adv', '--fetch-keys', 'https://apt.llvm.org/llvm-snapshot.gpg.key'])
          .then(checkCode('unable to retrieve llvm apt key'))
          .then(() => exec.getExecOutput('lsb_release', ['-cs']))
          .then(({stdout: ubuntuVersion, exitCode }) => {
            checkCode('unable to get ubuntu version')(exitCode);
            return ubuntuVersion.trim();
          })
          .then((ubuntuVersion) => exec.exec('sudo', ['apt-add-repository', `deb http://apt.llvm.org/${ubuntuVersion}/ llvm-toolchain-${ubuntuVersion}-${llvm} main`]))
          .then(checkCode('unable to add llvm apt repository'))
          .then(() => exec.exec('sudo', ['apt-fast', 'update']))
          .then(checkCode('unable to update apt repository'))
          .catch((err) => { core.warning(err); });

        code = await exec.exec('sudo', [
          'apt-fast',
          'install',
          '-y',
          `llvm-${llvm}-dev`,
          `clang-${llvm}`,
        ]);
      }

      break;
  }
  case 'win32':
      return;
  default:
      throw new Error(`Operating system ${os.platform()} is not supported by setup-odin`);
  }

  if (code !== 0) {
    throw new Error(`Installing Odin dependencies failed with exit code: ${code}`);
  }
}

/**
  * @param inputs {common.Inputs}
  *
  * @return Promise<bool> Whether to return or fallback to git based install.
  */
async function downloadRelease(inputs) {
  const parts = inputs.repository.split('/');
  if (parts.length < 2) {
    core.setFailed(`Invalid repository ${inputs.repository}.`);
    return true;
  }

  if (inputs.token == "") {
    core.warning('Invalid access token, falling back to git based install.');
    return false;
  }

  const octokit = github.getOctokit(inputs.token);

  const repoOpts = { repo: parts[parts.length-1], owner: parts[parts.length-2] };

  let release;
  if (inputs.release == "latest") {
    release = await octokit.rest.repos.getLatestRelease(repoOpts);
  } else {
    core.info(`Looking for release tagged: ${inputs.release}`);
    release = await octokit.rest.repos.getReleaseByTag({...repoOpts, tag: inputs.release });
  }

  const releaseOS = {
    'darwin': ['macos'],
    'linux':  ['linux', 'ubuntu'],
    'win32':  ['windows'],
  }[os.platform()];

  const releaseArch = {
    'x64':   'amd64',
    'arm64': 'arm64',
  }[os.arch()];

  let asset;
  for (const tryOS of releaseOS) {
    const releaseAssetPrefix = `odin-${tryOS}-${releaseArch}`;
    core.info(`Release has ${release.data.assets.length} assets, Looking for asset prefix: ${releaseAssetPrefix}`);

    asset = release.data.assets.find(asset => asset.name.startsWith(releaseAssetPrefix));
    if (asset) {
      break;
    }
  }

  if (!asset) {
      core.warning('could not find release asset to download, falling back to git based install.');
      return false;
  }

  // Linux/Darwin GitHub action runners come with LLVM 14 installed, we add it to path here so we can use
  // its `wasm-ld` and other LLVM binaries that do not come with the Odin release.
  // Because this is only really used for linking, I don't think it really matters if the versions
  // don't match.
  if (os.platform() == 'linux') {
    core.addPath(`/usr/lib/llvm-14/bin`);
  } else if (os.platform() == 'darwin') {
      // arm64.
      core.addPath(`/opt/homebrew/opt/llvm@15/bin`);
      // x64.
      core.addPath(`/usr/local/opt/llvm@15/bin`);
  }

  core.info('Downloading release');

  const download = await octokit.rest.repos.getReleaseAsset({
    ...repoOpts,
    asset_id: asset.id,
    headers: {
      'accept': 'application/octet-stream',
    },
  });

  core.info('Unzipping release');

  const zip = new AdmZip(Buffer.from(download.data));
  zip.extractAllTo(common.odinPath());

  // NOTE: after dev-2024-03 these releases are zipped in CI and then zipped again by GitHub.
  // So we check and unzip again here.
  // I know this is ugly, please do not come for me!
  const maybeZipInZip = `${common.odinPath()}/dist.zip`;
  if (fs.existsSync(maybeZipInZip)) {
    core.info('Unzipping nested zip');
    const zipInZip = new AdmZip(maybeZipInZip);
    zipInZip.extractAllTo(common.odinPath(), false, true);
    fs.unlinkSync(maybeZipInZip);
  }
  const maybeTarInZip = `${common.odinPath()}/dist.tar.gz`;
  if (fs.existsSync(maybeTarInZip)) {
    core.info('Extracting nested tar.gz');
    await tar.x({
      file: maybeTarInZip,
      cwd: common.odinPath(),
    });
    fs.unlinkSync(maybeTarInZip);
  }

  // NOTE: after dev-2024-06 releases don't seem to be doubly zipped anymore
  // but do still have the nested dist folder we need to move.

  // NOTE: dev-2024-07 has 'windows_artifacts' on windows, all others have 'dist'.

  const dir = fs.readdirSync(common.odinPath());
  if (dir.length == 1) {
    core.info('Moving dist folder');

    const distDir = `${common.odinPath()}/${dir[0]}`;

    // Basically does a `mv dist/* .`
    const entries = fs.readdirSync(distDir);
    await Promise.all(entries.map((entry) => io.mv(`${distDir}/${entry}`, `${common.odinPath()}/${entry}`)));

    // NOTE: somehow after dev-2024-06 we also need to make it executable again...
    finalizeRelease(inputs);

    return true;
  }

  finalizeRelease(inputs);

  // NOTE: Older releases of darwin did not bundle LLVM, from 2023-10 onwards it needs llvm 13 installed via brew.
  if (os.platform() == 'darwin') {
    await pullOdinBuildDependencies({ ...inputs, llvmVersion: '13' });
  }

  return true;
}

async function finalizeRelease(inputs) {
  // NOTE: after dev-2024-03 these releases have the executable permission by default, we still 
  // chmod to support older releases.
  if (os.platform() == 'linux' || os.platform() == 'darwin') {
    const code = await exec.exec(`chmod +x ${common.odinPath()}/odin`);
    if (code != 0) {
      core.warning(`Exit code ${code} making the compiler executable`);
    }
  }

  if (os.platform() == 'linux') {
    const possibleLibLLVMToRename = `${common.odinPath()}/libLLVM-18.so.1`;
    if (fs.existsSync(possibleLibLLVMToRename)) {
      fs.cpSync(possibleLibLLVMToRename, `${common.odinPath()}/libLLVM-18.so.18.1`);
    }

    let hasDynamicLLVM = false;
    const dir = fs.readdirSync(common.odinPath());
    for (const file of dir) {
      if (file.includes("libLLVM") && file.includes(".so")) {
        hasDynamicLLVM = true;
        break;
      }
    }

    if (hasDynamicLLVM) {
      await pullOdinBuildDependencies({...inputs, llvmVersion: '18'});
    }
  }
}

run();
