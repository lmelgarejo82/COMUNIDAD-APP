const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const queuePath = require.resolve('../jobs/masterTicketQueue');

function loadQueueWithBullMock({ queueEnabled, redisUrl, bullFactory }) {
  const previousQueueEnabled = process.env.QUEUE_ENABLED;
  const previousRedisUrl = process.env.REDIS_URL;
  const originalLoad = Module._load;

  process.env.QUEUE_ENABLED = queueEnabled;
  if (redisUrl === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = redisUrl;
  }

  delete require.cache[queuePath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'bull') {
      return bullFactory();
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  const queueModule = require('../jobs/masterTicketQueue');

  function restore() {
    Module._load = originalLoad;
    if (previousQueueEnabled === undefined) {
      delete process.env.QUEUE_ENABLED;
    } else {
      process.env.QUEUE_ENABLED = previousQueueEnabled;
    }
    if (previousRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previousRedisUrl;
    }
    delete require.cache[queuePath];
  }

  return { queueModule, restore };
}

test('QUEUE_ENABLED=false does not load Bull and init returns no queue', () => {
  const { queueModule, restore } = loadQueueWithBullMock({
    queueEnabled: 'false',
    bullFactory() {
      throw new Error('Bull should not be loaded when queue is disabled');
    },
  });

  try {
    const queue = queueModule.init();
    assert.equal(queue, null);
  } finally {
    restore();
  }
});

test('QUEUE_ENABLED=false enqueue returns safe no-op result', async () => {
  const { queueModule, restore } = loadQueueWithBullMock({
    queueEnabled: 'false',
    bullFactory() {
      throw new Error('Bull should not be loaded when queue is disabled');
    },
  });

  try {
    const result = await queueModule.enqueueGeneration(123);
    assert.deepEqual(result, {
      id: null,
      disabled: true,
      skipped: true,
      masterId: 123,
      reason: 'queue_disabled',
    });
  } finally {
    restore();
  }
});

test('QUEUE_ENABLED=true initializes Bull with configured REDIS_URL', () => {
  let receivedName = null;
  let receivedUrl = null;
  const fakeQueue = {
    on() {},
    process() {},
    add() {},
  };

  const { queueModule, restore } = loadQueueWithBullMock({
    queueEnabled: 'true',
    redisUrl: 'redis://redis:6379',
    bullFactory() {
      return class FakeBull {
        constructor(name, url) {
          receivedName = name;
          receivedUrl = url;
          return fakeQueue;
        }
      };
    },
  });

  try {
    const queue = queueModule.init();
    assert.equal(queue, fakeQueue);
    assert.equal(receivedName, 'generate-subtickets');
    assert.equal(receivedUrl, 'redis://redis:6379');
  } finally {
    restore();
  }
});
