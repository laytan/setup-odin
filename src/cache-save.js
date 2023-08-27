const cache = require('@actions/cache');
const core = require('@actions/core');

const os = require('os');

const common = require('./common');

async function run() {
  try {
    const inputs = common.getInputs();
    if (!common.cacheCheck(inputs)) {
      return;
    }

    const promises = [];

    if (core.getState('cache-hit') !== 'true') {
      promises.push(
        cache.saveCache([common.odinPath()], common.mainCacheKey(inputs)),
      );
    } else {
      core.info('Odin cache was hit, not saving it again');
    }

    if (os.platform() === 'darwin') {
      if (core.getState('darwin-cache-hit') !== 'true') {
        promises.push(
          cache.saveCache(common.darwinCachePaths(inputs), common.darwinCacheKey(inputs)),
        );
      } else {
        core.info('Darwin LLVM cache was hit, not saving it again');
      }
    }

    await Promise.all(promises);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
