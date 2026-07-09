const Bull = require('bull');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

function createQueue(name, options = {}) {
  const defaultOptions = {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
    ...options,
  };

  try {
    const q = new Bull(name, REDIS_URL, defaultOptions);

    q.on('ready', () => console.log(`[queue] ${name}: ready`));
    q.on('error', (err) => console.error(`[queue] ${name}: error`, err.message));
    q.on('failed', (job, err) =>
      console.error(`[queue] ${name}: job ${job.id} failed (attempt ${job.attemptsMade}): ${err.message}`)
    );

    return q;
  } catch (err) {
    console.warn(`[queue] ${name}: Bull/Redis no disponible — ${err.message}`);
    return null;
  }
}

module.exports = { createQueue, REDIS_URL };
