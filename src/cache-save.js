const cache = require('@actions/cache');
const core = require('@actions/core');

const common = require('./common');

async function run() {
  try {
    const inputs = common.getInputs();
    if (!common.cacheCheck(inputs)) {
      return;
    }
  
    const key = common.composeCacheKey(inputs);
    await cache.saveCache([common.odinPath()], key);
    core.info('Saved Odin in cache');
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
