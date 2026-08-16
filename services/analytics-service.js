const { callFunction } = require('../utils/cloud');
const storage = require('../utils/storage');
const { STORAGE_KEYS } = require('../utils/constants');
const { ANALYTICS_QUEUE_LIMIT } = require('../utils/env');

function defaultSender(events) {
  return callFunction('analytics', { action: 'trackBatch', events });
}

let sender = defaultSender;
let flushing = null;

function createIdemKey(event, timestamp) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${String(event).slice(0, 20)}_${timestamp}_${random}`.slice(0, 64);
}

function getQueue() {
  const queue = storage.get(STORAGE_KEYS.ANALYTICS_QUEUE, []);
  return Array.isArray(queue) ? queue : [];
}

function saveQueue(queue) {
  storage.set(STORAGE_KEYS.ANALYTICS_QUEUE, queue.slice(-ANALYTICS_QUEUE_LIMIT));
}

async function flush() {
  if (flushing) return flushing;
  const batch = getQueue();
  if (batch.length === 0) return true;

  flushing = Promise.resolve()
    .then(() => sender(batch.slice()))
    .then(() => {
      const current = getQueue();
      saveQueue(current.slice(batch.length));
      return true;
    })
    .catch(() => false)
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

async function track(event, properties = {}) {
  try {
    const eventName = String(event || 'unknown');
    const clientTs = Date.now();
    const queue = getQueue();
    queue.push({
      event: eventName,
      props: properties && typeof properties === 'object' ? { ...properties } : {},
      clientTs,
      idemKey: createIdemKey(eventName, clientTs),
    });
    saveQueue(queue);
    flush().catch(() => {});
  } catch (err) {
    // 埋点不能影响主业务。
  }
}

function __setSender(nextSender) {
  sender = typeof nextSender === 'function' ? nextSender : defaultSender;
  flushing = null;
}

function __getQueue() {
  return getQueue().map((item) => ({ ...item }));
}

module.exports = {
  track,
  flush,
  __setSender,
  __getQueue,
};
