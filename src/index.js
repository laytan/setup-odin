const exec = require('@actions/exec');
const core = require('@actions/core');
const cache = require('@actions/cache');
const io = require('@actions/io');
const github = require('@actions/github');
const AdmZip = require('adm-zip');

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

    let pulledOdinDeps = false;
    if (inputs.release !== "") {
      const promises = [downloadRelease(inputs)];

      // NOTE: darwin is weird where it still requires an llvm installation, and also the same
      // installation that was used to build the release.
      if (os.platform() == 'darwin') {
        if (inputs.llvmVersion != '13') {
          core.info('Overwritten llvm to version 13, this is needed for compatibility with the pre-compiled releases.');
        }
        promises.push(pullOdinBuildDependencies({...inputs, llvmVersion: '13'}));
      }

      const [releaseOk, ] = await Promise.all(promises);
      if (releaseOk) {
        core.setOutput('cache-hit', false);
        core.saveState('cache-hit', 'false');
        return;
      }
      pulledOdinDeps = true;
    }

    if (common.cacheCheck(inputs)) {
      const promises = [restoreCache(inputs, odinPath)];
      if (!pulledOdinDeps) {
        promises.push(pullOdinBuildDependencies(inputs));
      }

      const [cacheSuccess, ] = await Promise.all(promises);
      if (cacheSuccess) {
        return;
      }
    } else {
      const promises = [pullOdin(inputs.repository, inputs.branch)];
      if (!pulledOdinDeps) {
        promises.push(pullOdinBuildDependencies(inputs));
      }
      await Promise.all(promises);
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

    if (await pullUpdates(odinPath, inputs.odinVersion)) {
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

      core.addPath(`/usr/local/opt/llvm@${llvm}/bin`);
      break;
  }
  case 'linux': {
      core.addPath(`/usr/lib/llvm-${llvm}/bin`);

      await io.which(`llvm-${llvm}`)
        .then(() => {
          core.info(`LLVM ${llvm} comes pre-installed on this runner`);
          code = 0;
        })
        .catch(async () => {
          code = await exec.exec('sudo', [
            'apt-fast',
            'install',
            `llvm-${llvm}-dev`,
            `clang-${llvm}`,
          ]);
        });
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
  if (os.arch() != 'x64') {
    core.warning(`There are no pre-compiled releases for the architecture ${os.arch()}, falling back to git based install.`);
    return false;
  }

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
  
  let releaseAssetPrefix;
  const platform = os.platform();
  switch (platform) {
  case 'darwin': {
    releaseAssetPrefix = 'odin-macos-amd64';
    break;
  }
  case 'linux': {
    releaseAssetPrefix = 'odin-ubuntu-amd64';
    break;
  }
  case 'win32': {
    releaseAssetPrefix = 'odin-windows-amd64';
    break
  }
  default:
      throw new Error(`Operating system ${os.platform()} is not supported by setup-odin`);
  }
  
  core.info(`Release has ${release.data.assets.length} assets, Looking for asset prefix: ${releaseAssetPrefix}`);

  const asset = release.data.assets.find(asset => asset.name.startsWith(releaseAssetPrefix));
  if (!asset) {
    core.setFailed('could not find release asset to download');
    return true;
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
  
  if (platform == 'linux' || platform == 'darwin') {
    const code = await exec.exec(`chmod +x ${common.odinPath()}/odin`);
    if (code != 0) {
      core.warning(`Exit code ${code} making the compiler executable`);
    }
  }

  return true;
}

run();
