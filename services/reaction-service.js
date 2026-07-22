// 云端收藏 / 点赞服务层
// 设计要点：
// 1. 所有读写经云函数 reaction，云端以确定式 _id 保证“同一用户对同一内容不重复”。
// 2. 本地缓存（storage）仅用于“即时渲染 + 弱网降级”，云端为唯一事实来源。
// 3. 操作采用乐观更新：先改本地缓存并刷新界面，云端成功则确认，失败则回滚并提示。
const { callFunction } = require('../utils/cloud');
const storage = require('../utils/storage');
const { getQuoteById } = require('../utils/quote-data');
const { formatTime, truncateText, showToast } = require('../utils/util');

const CACHE_KEYS = {
  favorite: 'cloud_favorite_status',
  like: 'cloud_like_status',
};

function readCache(type) {
  return storage.get(CACHE_KEYS[type], {});
}

function writeCache(type, map) {
  storage.set(CACHE_KEYS[type], map);
}

function setCache(type, targetId, status) {
  const map = readCache(type);
  map[targetId] = status;
  writeCache(type, map);
}

// 批量状态查询：先返回本地缓存（即时渲染），再向云端校正并回写缓存
async function batchStatus(type, targetIds) {
  const input = Array.isArray(targetIds) ? targetIds : [targetIds];
  const ids = Array.from(new Set(input.map(Number).filter(Number.isFinite)));
  const cached = readCache(type);
  const result = {};
  ids.forEach((id) => {
    result[id] = !!cached[id];
  });

  if (ids.length === 0) return result;

  try {
    const res = await callFunction('reaction', { action: 'status', type, targetIds: ids });
    if (res && res.success && res.map) {
      const merged = readCache(type);
      ids.forEach((id) => {
        result[id] = !!res.map[id];
        merged[id] = !!res.map[id];
      });
      writeCache(type, merged);
    }
  } catch (err) {
    // 网络失败：退化为本地缓存，不阻断界面展示
    console.error('batchStatus failed', err);
  }
  return result;
}

async function getStatus(type, targetId) {
  const map = await batchStatus(type, [targetId]);
  return !!map[targetId];
}

function requireTargetId(targetId) {
  const tid = Number(targetId);
  if (!Number.isFinite(tid)) {
    throw new Error('目标内容ID不合法');
  }
  return tid;
}

// 切换收藏 / 点赞状态，返回切换后的最终状态（云端为准）
async function toggle(type, targetId, { silent = false } = {}) {
  const tid = requireTargetId(targetId);
  const before = !!readCache(type)[tid];
  const optimistic = !before;
  setCache(type, tid, optimistic); // 乐观更新，界面立即反馈

  try {
    const res = await callFunction('reaction', { action: 'toggle', type, targetId: tid });
    const finalStatus = res && res.success ? !!res.status : optimistic;
    setCache(type, tid, finalStatus);
    return finalStatus;
  } catch (err) {
    setCache(type, tid, before); // 回滚到操作前状态
    if (!silent) showToast('操作失败，请重试');
    throw err;
  }
}

async function add(type, targetId, { silent = false } = {}) {
  const tid = requireTargetId(targetId);
  try {
    const res = await callFunction('reaction', { action: 'add', type, targetId: tid });
    const status = res && res.success ? true : false;
    setCache(type, tid, status);
    return status;
  } catch (err) {
    if (!silent) showToast('操作失败，请重试');
    throw err;
  }
}

async function remove(type, targetId, { silent = false } = {}) {
  const tid = requireTargetId(targetId);
  try {
    const res = await callFunction('reaction', { action: 'remove', type, targetId: tid });
    setCache(type, tid, false);
    return true;
  } catch (err) {
    if (!silent) showToast('操作失败，请重试');
    throw err;
  }
}

async function getList(type, limit) {
  const res = await callFunction('reaction', { action: 'list', type, limit });
  if (!res || !res.success) throw new Error('获取列表失败');
  return res.list || [];
}

// 列表 + 金句内容：直接产出页面所需的展示结构（含 summary / timeText）
async function getListWithQuotes(type, limit) {
  const list = await getList(type, limit);
  return list
    .map((item) => {
      const quote = getQuoteById(item.targetId);
      if (!quote) return null;
      return {
        ...quote,
        summary: truncateText(quote.content, 30),
        timeText: formatTime(item.createTime),
        createTime: item.createTime,
      };
    })
    .filter(Boolean);
}

async function getCount(type) {
  try {
    const res = await callFunction('reaction', { action: 'count', type });
    if (!res || !res.success) return 0;
    return res.total || 0;
  } catch (err) {
    return 0;
  }
}

module.exports = {
  batchStatus,
  getStatus,
  toggle,
  add,
  remove,
  getList,
  getListWithQuotes,
  getCount,
};
