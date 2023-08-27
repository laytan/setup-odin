const cache = require('@actions/cache');
const core = require('@actions/core');

const common = require('./common');

async function run() {
  try {
    const inputs = common.getInputs();
    if (!common.cacheCheck(inputs)) {
      return;
    }

    if (core.getState('cache-hit') === 'true') {
      core.info('Cache was hit, not saving it again');
      return;
    }
  
    const key = common.composeCacheKey(inputs);
    await cache.saveCache([common.cachePaths()], key);
    core.info('Saved Odin in cache');
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
