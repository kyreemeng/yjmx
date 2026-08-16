const reactionService = require('./reaction-service');
const analytics = require('./analytics-service');

function getPathValue(source, path) {
  return String(path || '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .reduce((value, key) => (value == null ? undefined : value[key]), source);
}

function updatePage(page, patch) {
  if (page && typeof page.setData === 'function') {
    page.setData(patch);
    return;
  }
  Object.keys(patch).forEach((path) => {
    const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let target = page.data;
    keys.slice(0, -1).forEach((key) => {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      target = target[key];
    });
    target[keys[keys.length - 1]] = patch[path];
  });
}

async function toggleInteraction(page, {
  type,
  targetId,
  statusPath,
  countPath,
  event,
  analyticsData = {},
  silent = true,
} = {}) {
  if (!page || !page.data || !statusPath) {
    throw new TypeError('toggleInteraction 需要 page 与 statusPath');
  }

  const beforeStatus = !!getPathValue(page.data, statusPath);
  const beforeCount = countPath ? Math.max(0, Number(getPathValue(page.data, countPath)) || 0) : null;
  const optimisticStatus = !beforeStatus;
  const optimisticPatch = { [statusPath]: optimisticStatus };
  if (countPath) {
    optimisticPatch[countPath] = Math.max(0, beforeCount + (optimisticStatus ? 1 : -1));
  }
  updatePage(page, optimisticPatch);

  try {
    const finalStatus = await reactionService.toggle(type, targetId, { silent });
    const confirmedPatch = { [statusPath]: finalStatus };
    if (countPath) {
      confirmedPatch[countPath] = Math.max(0, beforeCount + (finalStatus === beforeStatus ? 0 : finalStatus ? 1 : -1));
    }
    updatePage(page, confirmedPatch);
    await analytics.track(
      typeof event === 'string' && event ? event : `${type}_toggle`,
      { type, targetId: Number(targetId), status: finalStatus, ...analyticsData }
    );
    return finalStatus;
  } catch (error) {
    const rollback = { [statusPath]: beforeStatus };
    if (countPath) rollback[countPath] = beforeCount;
    updatePage(page, rollback);
    throw error;
  }
}

module.exports = {
  toggleInteraction,
};
